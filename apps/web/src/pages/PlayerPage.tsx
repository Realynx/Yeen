import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlayerDetails } from '../components/player/PlayerDetails';
import { PlayerVideoPanel } from '../components/player/PlayerVideoPanel';
import { ProfileMenu } from '../components/ProfileMenu';
import { listMedia, upsertProgress } from '../lib/api';
import type { MediaItem, User } from '../lib/types';
import {
  episodeDisplayTitle,
  episodeFrameImageUrl,
  normalizeShowKey,
} from './media-details/mediaDetailsUtils';
import { usePlayerData } from './player/usePlayerData';
import { usePlayerKeyboardShortcuts } from './player/usePlayerKeyboardShortcuts';
import { usePlayerMediaSource } from './player/usePlayerMediaSource';
import { usePlayerPageEffects } from './player/usePlayerPageEffects';
import { usePlayerTimelineHandlers } from './player/usePlayerTimelineHandlers';
import { usePlayerVideoPanelHandlers } from './player/usePlayerVideoPanelHandlers';
import { clamp, readPlayerPreferences } from './player/playerUtils';

function compareEpisodeOrder(left: MediaItem, right: MediaItem): number {
  const seasonDelta = (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
  if (seasonDelta !== 0) {
    return seasonDelta;
  }

  const episodeDelta = (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
  if (episodeDelta !== 0) {
    return episodeDelta;
  }

  return episodeDisplayTitle(left).localeCompare(episodeDisplayTitle(right));
}

function episodeCode(item: MediaItem): string {
  return `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}`;
}

interface PlayerPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function PlayerPage({ token, user, onLogout }: PlayerPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const initialPreferences = useMemo(() => readPlayerPreferences(), []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef(0);
  const hideControlsTimerRef = useRef<number | null>(null);
  const hasAppliedInitialSeekRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [theaterMode, setTheaterMode] = useState(initialPreferences.theaterMode);
  const [volume, setVolume] = useState(initialPreferences.volume);
  const [muted, setMuted] = useState(initialPreferences.muted);
  const [playbackRate, setPlaybackRate] = useState(initialPreferences.playbackRate);
  const [showEpisodes, setShowEpisodes] = useState<MediaItem[]>([]);

  const autoAdvanceLockRef = useRef<string | null>(null);

  const {
    media,
    source,
    subtitleTracks,
    selectedSubtitleId,
    selectedSubtitle,
    resumeAtSeconds,
    loading,
    error,
    switchingToHls,
    setSelectedSubtitleId,
    extractTrack,
    switchToHls,
  } = usePlayerData(token, mediaId);

  const requestedStartSeconds = useMemo(() => {
    const raw = searchParams.get('t');
    if (!raw) {
      return 0;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return parsed;
  }, [searchParams]);

  const totalDuration = useMemo(() => {
    if (duration > 0) {
      return duration;
    }

    return Math.max(media?.durationSeconds ?? 0, 0);
  }, [duration, media?.durationSeconds]);

  const safeDuration = Math.max(totalDuration, 1);
  const playedPercent = clamp((currentTime / safeDuration) * 100, 0, 100);

  const activeSubtitle = subtitleVisible && selectedSubtitle?.url ? selectedSubtitle : null;
  const playerTitle =
    media?.type === 'show' && media.episodeTitle?.trim()
      ? media.episodeTitle.trim()
      : media?.title ?? 'Player';

  useEffect(() => {
    autoAdvanceLockRef.current = null;
  }, [mediaId]);

  useEffect(() => {
    let cancelled = false;

    async function loadShowEpisodes() {
      if (!media || media.type !== 'show') {
        setShowEpisodes([]);
        return;
      }

      try {
        const items = await listMedia(token);
        if (cancelled) {
          return;
        }

        const showKey = normalizeShowKey(media);
        const siblingEpisodes = items
          .filter((item) => item.type === 'show' && normalizeShowKey(item) === showKey)
          .sort(compareEpisodeOrder);
        setShowEpisodes(siblingEpisodes);
      } catch {
        if (!cancelled) {
          setShowEpisodes([]);
        }
      }
    }

    void loadShowEpisodes();

    return () => {
      cancelled = true;
    };
  }, [media?.id, media?.type, media?.normalizedTitle, media?.title, token]);

  const currentEpisodeIndex = useMemo(() => {
    if (!media || media.type !== 'show') {
      return -1;
    }

    return showEpisodes.findIndex((item) => item.id === media.id);
  }, [media, showEpisodes]);

  const previousEpisode =
    currentEpisodeIndex > 0 ? showEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < showEpisodes.length - 1
      ? showEpisodes[currentEpisodeIndex + 1]
      : null;

  const previousEpisodeImage = previousEpisode ? episodeFrameImageUrl(previousEpisode) : null;
  const nextEpisodeImage = nextEpisode ? episodeFrameImageUrl(nextEpisode) : null;

  // Must be memoized — `usePlayerMediaSource` lists this in its effect deps.
  // A fresh function literal on every render would re-run the effect, which
  // destroys/recreates the Hls instance and resets currentTime to 0 (making
  // playback never start and the scrubber snap back to zero on every event).
  const restartHlsSession = useCallback(() => switchToHls(true), [switchToHls]);

  const {
    hlsLevels,
    qualityMode,
    setQualityMode,
    currentAutoLevel,
    attemptedHlsFallbackRef,
  } = usePlayerMediaSource({
    videoRef,
    source,
    restartHlsSession,
    hasAppliedInitialSeekRef,
    setPlayerError,
    setIsBuffering,
    setCurrentTime,
    setDuration,
    setSeekValue,
    setBufferedPercent,
  });

  const qualityStatus = useMemo(() => {
    if (!source?.hls) {
      return 'Direct Play';
    }

    if (qualityMode === 'auto') {
      const level = hlsLevels.find((item) => item.index === currentAutoLevel);
      return level ? `Auto (${level.label})` : 'Auto';
    }

    const selectedLevel = hlsLevels.find((item) => item.index === qualityMode);
    return selectedLevel?.label ?? 'Manual';
  }, [currentAutoLevel, hlsLevels, qualityMode, source?.hls]);

  const canUsePictureInPicture = useMemo(() => Boolean(document.pictureInPictureEnabled), []);

  const clearControlsTimer = useCallback(() => {
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }, []);

  const scheduleControlsAutoHide = useCallback(() => {
    clearControlsTimer();

    if (!isPlaying || isSeeking) {
      return;
    }

    hideControlsTimerRef.current = window.setTimeout(() => {
      setIsControlsVisible(false);
    }, 2200);
  }, [clearControlsTimer, isPlaying, isSeeking]);

  const revealControls = useCallback(() => {
    setIsControlsVisible(true);
    scheduleControlsAutoHide();
  }, [scheduleControlsAutoHide]);

  const syncProgress = useCallback(
    async (completed = false) => {
      const video = videoRef.current;
      if (!video || !mediaId) {
        return;
      }

      const safeVideoDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
      await upsertProgress(token, mediaId, {
        positionSeconds: Math.max(0, Math.floor(video.currentTime || 0)),
        durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
        completed,
      });
    },
    [mediaId, token, totalDuration],
  );

  const seekTo = useCallback(
    (nextSeconds: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const maxDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
      const target = clamp(nextSeconds, 0, Math.max(maxDuration, 0));
      video.currentTime = target;
      setCurrentTime(target);
      setSeekValue(target);
      revealControls();
    },
    [revealControls, totalDuration],
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      const origin = video?.currentTime ?? currentTime;
      seekTo(origin + deltaSeconds);
    },
    [currentTime, seekTo],
  );

  const applyVolume = useCallback(
    (nextVolume: number) => {
      const normalized = clamp(nextVolume, 0, 1);
      setVolume(normalized);
      setMuted(normalized === 0);
      revealControls();
    },
    [revealControls],
  );

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (video.paused || video.ended) {
        await video.play();
      } else {
        video.pause();
      }
      setPlayerError(null);
    } catch (playError) {
      if (playError instanceof DOMException && playError.name === 'AbortError') {
        return;
      }

      if (playError instanceof DOMException && playError.name === 'NotAllowedError') {
        setPlayerError('Playback start was blocked by browser policy. Click play again to continue.');
        return;
      }

      setPlayerError(
        source?.hls
          ? 'Playback could not start while the stream is recovering. Click play to retry.'
          : 'Playback could not start. Click play to retry.',
      );
    }
  }, [source?.hls]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    if (!nextMuted && volume <= 0.01) {
      setVolume(0.8);
    }
    setMuted(nextMuted);
    revealControls();
  }, [muted, revealControls, volume]);

  const toggleSubtitleVisibility = useCallback(() => {
    if (!selectedSubtitle?.url) {
      const fallbackTrack = subtitleTracks.find((track) => !!track.url);
      if (!fallbackTrack) {
        return;
      }

      setSelectedSubtitleId(fallbackTrack.id);
      setSubtitleVisible(true);
      revealControls();
      return;
    }

    setSubtitleVisible((previous) => !previous);
    revealControls();
  }, [revealControls, selectedSubtitle?.url, setSelectedSubtitleId, subtitleTracks]);

  const toggleFullscreen = useCallback(async () => {
    const shell = videoShellRef.current;
    if (!shell) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
      setPlayerError(null);
    } catch {
      setPlayerError('Fullscreen mode is unavailable in this browser.');
    }

    revealControls();
  }, [revealControls]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !canUsePictureInPicture) {
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPictureInPicture(false);
      } else {
        await video.requestPictureInPicture();
        setIsPictureInPicture(true);
      }
      setPlayerError(null);
    } catch {
      setPlayerError('Picture-in-picture mode is unavailable in this browser.');
    }

    revealControls();
  }, [canUsePictureInPicture, revealControls]);

  const adjustPlaybackRate = useCallback(
    (delta: number) => {
      setPlaybackRate((previous) => clamp(previous + delta, 0.5, 2));
      revealControls();
    },
    [revealControls],
  );

  usePlayerKeyboardShortcuts({
    applyVolume,
    revealControls,
    skipBy,
    toggleFullscreen,
    toggleMute,
    togglePictureInPicture,
    togglePlay,
    toggleSubtitleVisibility,
    adjustPlaybackRate,
    volume,
  });

  usePlayerPageEffects({
    clearControlsTimer,
    isPlaying,
    isSeeking,
    scheduleControlsAutoHide,
    volume,
    muted,
    playbackRate,
    theaterMode,
    videoRef,
    activeSubtitleUrl: activeSubtitle?.url ?? null,
    setIsFullscreen,
    setIsPictureInPicture,
    syncProgress,
  });

  useEffect(() => {
    hasAppliedInitialSeekRef.current = false;
  }, [mediaId, requestedStartSeconds, source?.url]);

  const {
    handleTimeUpdate,
    handleBufferedProgress,
    handleDurationChange,
    handleLoadedMetadata,
    handleSeekInputChange,
    handleSeekPointerDown,
    handleSeekPointerUp,
    handleSeekPreview,
  } = usePlayerTimelineHandlers({
    videoRef,
    totalDuration,
    requestedStartSeconds,
    resumeAtSeconds,
    isSeeking,
    lastSyncRef,
    hasAppliedInitialSeekRef,
    setCurrentTime,
    setSeekValue,
    setBufferedPercent,
    setDuration,
    setIsBuffering,
    setIsSeeking,
    setSeekPreviewSeconds,
    seekTo,
    revealControls,
    syncProgress,
  });

  const {
    hideControls,
    clearSeekPreview,
    handleSeekTouchEnd,
    handlePlaybackRateChange,
    handleQualityModeChange,
    handleToggleTheaterMode,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnded,
    handleVideoWaiting,
    handleVideoReady,
    handleVideoError,
  } = usePlayerVideoPanelHandlers({
    mediaId,
    revealControls,
    seekTo,
    seekValue,
    setIsSeeking,
    setSeekPreviewSeconds,
    setPlaybackRate,
    setQualityMode,
    setTheaterMode,
    setIsPlaying,
    setIsBuffering,
    setIsControlsVisible,
    setPlayerError,
    syncProgress,
    switchingToHls,
    source,
    attemptedHlsFallbackRef,
    switchToHls,
    videoRef,
  });

  const handleVideoEndedWithAutoNext = useCallback(() => {
    handleVideoEnded();

    if (!nextEpisode) {
      return;
    }

    if (autoAdvanceLockRef.current === nextEpisode.id) {
      return;
    }

    autoAdvanceLockRef.current = nextEpisode.id;
    navigate(`/player/${nextEpisode.id}`);
  }, [handleVideoEnded, navigate, nextEpisode]);

  return (
    <main className="player-page">
      <header className="top-nav">
        <div className="top-nav-left">
          <button
            type="button"
            className="nav-back-button"
            aria-label="Go back"
            title="Go back"
            onClick={handleBackNavigation}
          >
            <span aria-hidden="true">←</span>
          </button>
          <p className="brand-mark">YEEN</p>
          <p className="page-nav-title" title={playerTitle}>{playerTitle}</p>
        </div>

        <div className="top-nav-right">
          <button className="ghost-button" onClick={() => navigate('/')}>Library</button>
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      {loading ? <p className="muted">Preparing stream...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {playerError ? <p className="error-text">{playerError}</p> : null}
      {switchingToHls ? <p className="muted">Switching to transcoded stream...</p> : null}

      <section className={`player-layout ${theaterMode ? 'player-layout-theater' : ''}`}>
        <PlayerVideoPanel
          token={token}
          media={media}
          activeSubtitle={activeSubtitle}
          subtitleTracks={subtitleTracks}
          selectedSubtitleId={selectedSubtitleId}
          onSelectSubtitle={(subtitleId) => {
            setSelectedSubtitleId(subtitleId);
            setSubtitleVisible(subtitleId !== '');
          }}
          onExtractSubtitle={(track) => {
            setSubtitleVisible(true);
            void extractTrack(track);
          }}
          videoRef={videoRef}
          videoShellRef={videoShellRef}
          isControlsVisible={isControlsVisible}
          isPlaying={isPlaying}
          isSeeking={isSeeking}
          isBuffering={isBuffering}
          isFullscreen={isFullscreen}
          isPictureInPicture={isPictureInPicture}
          canUsePictureInPicture={canUsePictureInPicture}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          theaterMode={theaterMode}
          currentTime={currentTime}
          totalDuration={totalDuration}
          safeDuration={safeDuration}
          playedPercent={playedPercent}
          bufferedPercent={bufferedPercent}
          seekValue={seekValue}
          seekPreviewSeconds={seekPreviewSeconds}
          qualityStatus={qualityStatus}
          isHlsSource={Boolean(source?.hls)}
          hlsLevels={hlsLevels}
          qualityMode={qualityMode}
          onRevealControls={revealControls}
          onHideControls={hideControls}
          onTogglePlay={() => { void togglePlay(); }}
          onToggleFullscreen={() => { void toggleFullscreen(); }}
          onToggleMute={toggleMute}
          onToggleTheaterMode={handleToggleTheaterMode}
          onTogglePictureInPicture={() => { void togglePictureInPicture(); }}
          onSkipBy={skipBy}
          onSeekTo={seekTo}
          onApplyVolume={applyVolume}
          onPlaybackRateChange={handlePlaybackRateChange}
          onQualityModeChange={handleQualityModeChange}
          onClearSeekPreview={clearSeekPreview}
          onSeekPreview={handleSeekPreview}
          onSeekInputChange={handleSeekInputChange}
          onSeekPointerDown={handleSeekPointerDown}
          onSeekPointerUp={handleSeekPointerUp}
          onSeekTouchEnd={handleSeekTouchEnd}
          onVideoPlay={handleVideoPlay}
          onVideoPause={handleVideoPause}
          onVideoEnded={handleVideoEndedWithAutoNext}
          onVideoTimeUpdate={handleTimeUpdate}
          onVideoDurationChange={handleDurationChange}
          onVideoLoadedMetadata={handleLoadedMetadata}
          onVideoProgress={handleBufferedProgress}
          onVideoWaiting={handleVideoWaiting}
          onVideoPlaying={handleVideoReady}
          onVideoCanPlay={handleVideoReady}
          onVideoError={handleVideoError}
        />
      </section>

      {media?.type === 'show' && (previousEpisode || nextEpisode) ? (
        <section
          className={`player-episode-nav${previousEpisode && nextEpisode ? '' : ' is-single'}`}
          aria-label="Episode navigation"
        >
          {previousEpisode ? (
            <button
              type="button"
              className="player-episode-link"
              onClick={() => navigate(`/player/${previousEpisode.id}`)}
              style={previousEpisodeImage ? ({ ['--player-episode-bg' as string]: `url("${previousEpisodeImage}")` }) : undefined}
            >
              <span className="player-episode-link-kicker">Previous Episode</span>
              <span className="player-episode-link-code">{episodeCode(previousEpisode)}</span>
              <strong className="player-episode-link-title">{episodeDisplayTitle(previousEpisode)}</strong>
            </button>
          ) : null}

          {nextEpisode ? (
            <button
              type="button"
              className="player-episode-link is-next"
              onClick={() => navigate(`/player/${nextEpisode.id}`)}
              style={nextEpisodeImage ? ({ ['--player-episode-bg' as string]: `url("${nextEpisodeImage}")` }) : undefined}
            >
              <span className="player-episode-link-kicker">Next Episode</span>
              <span className="player-episode-link-code">{episodeCode(nextEpisode)}</span>
              <strong className="player-episode-link-title">{episodeDisplayTitle(nextEpisode)}</strong>
            </button>
          ) : null}
        </section>
      ) : null}

      <PlayerDetails
        media={media}
        totalDuration={totalDuration}
        currentTime={currentTime}
      />
    </main>
  );
}
