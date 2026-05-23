import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlayerDetails } from '../components/player/PlayerDetails';
import { PlayerVideoPanel } from '../components/player/PlayerVideoPanel';
import { listMedia, upsertProgress } from '../lib/api';
import type { User } from '../lib/types';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from './librarySearchUtils';
import { PlayerPreparingPanel } from './player/PlayerPreparingPanel';
import { PlayerDownloadProgress } from './player/PlayerDownloadProgress';
import { PlayerEpisodeNavigation } from './player/PlayerEpisodeNavigation';
import { PlayerTopBar } from './player/PlayerTopBar';
import { usePlayerData } from './player/usePlayerData';
import { usePlayerKeyboardShortcuts } from './player/usePlayerKeyboardShortcuts';
import { usePlayerMediaSource } from './player/usePlayerMediaSource';
import { usePlayerPageEffects } from './player/usePlayerPageEffects';
import { usePlayerTimelineHandlers } from './player/usePlayerTimelineHandlers';
import { usePlayerVideoPanelHandlers } from './player/usePlayerVideoPanelHandlers';
import { usePlayerControlsTimer } from './player/usePlayerControlsTimer';
import { usePlayerInteractions } from './player/usePlayerInteractions';
import { usePlayerCasting } from './player/usePlayerCasting';
import { usePlayerDiagnostics } from './player/usePlayerDiagnostics';
import { useShowEpisodes } from './player/useShowEpisodes';
import { normalizeShowKey } from './media-details/mediaDetailsUtils';
import { clamp, readPlayerPreferences } from './player/playerUtils';

interface PlayerPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

const PLAYER_SCRUBBING_CLASS = 'is-player-scrubbing';

function redactAccessToken(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    parsed.searchParams.delete('access_token');
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/([?&])access_token=[^&]+/gi, '$1').replace(/[?&]$/, '');
  }
}

export function PlayerPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();

  const prepareHash = searchParams.get('prepareHash')?.trim() ?? '';
  const fallbackTitle = searchParams.get('title') ?? '';

  if (prepareHash) {
    return (
      <PlayerPreparingPanel
        token={token}
        user={user}
        onLogout={onLogout}
        mediaId={mediaId}
        hash={prepareHash}
        fallbackTitle={fallbackTitle}
        hideTopNav={hideTopNav}
        headerContent={headerContent}
      />
    );
  }

  return (
    <PlayerPlaybackPage
      token={token}
      user={user}
      onLogout={onLogout}
      hideTopNav={hideTopNav}
      headerContent={headerContent}
    />
  );
}

interface PlayerPlaybackPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

function PlayerPlaybackPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPlaybackPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const openRandomDetails = useCallback(async () => {
    try {
      const mediaItems = await listMedia(token);
      const randomCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!randomCandidate) {
        return;
      }

      navigate(`/details/${randomCandidate.id}`);
    } catch {
      // Keep playback uninterrupted if random details lookup fails.
    }
  }, [navigate, token]);

  const initialPreferences = useMemo(() => readPlayerPreferences(), []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const progressSyncTimestampRef = useRef(0);
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
  const [subtitleFontPreset, setSubtitleFontPreset] =
    useState(initialPreferences.subtitleFontPreset);

  const {
    media,
    source,
    streamTorrentHash,
    audioTracks,
    selectedAudioStreamIndex,
    subtitleTracks,
    selectedSubtitleId,
    selectedSubtitle,
    resumeAtSeconds,
    loading,
    error,
    switchingToHls,
    setSelectedAudioStreamIndex,
    setSelectedSubtitleId,
    extractTrack,
    switchToHls,
  } = usePlayerData(token, mediaId);

  const {
    downloadingTorrent,
    showNerdStats,
    hlsSessionStats,
    hlsSessionStatsError,
    hlsSessionStatsUpdatedAt,
    videoTelemetry,
    toggleNerdStats,
  } = usePlayerDiagnostics({ token, source, streamTorrentHash, videoRef });

  useEffect(() => {
    if (!isSeeking) {
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
      return;
    }

    const preventSelection = (event: Event) => {
      event.preventDefault();
    };

    const clearSelection = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      } catch {
        // Ignore selection API edge cases during scrubbing.
      }
    };

    document.body.classList.add(PLAYER_SCRUBBING_CLASS);
    clearSelection();
    document.addEventListener('selectstart', preventSelection);
    document.addEventListener('dragstart', preventSelection);
    document.addEventListener('selectionchange', clearSelection);

    return () => {
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('dragstart', preventSelection);
      document.removeEventListener('selectionchange', clearSelection);
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
    };
  }, [isSeeking]);

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

  const {
    previousEpisode,
    nextEpisode,
    previousEpisodeImage,
    nextEpisodeImage,
    withAutoAdvance,
  } = useShowEpisodes(token, media, mediaId);

  // Must be memoized — `usePlayerMediaSource` lists this in its effect deps.
  // A fresh function literal on every render would re-run the effect, which
  // destroys/recreates the Hls instance and resets currentTime to 0 (making
  // playback never start and the scrubber snap back to zero on every event).
  const restartHlsSession = useCallback(
    () =>
      switchToHls({
        forceFresh: true,
        audioStreamIndex: selectedAudioStreamIndex,
      }),
    [selectedAudioStreamIndex, switchToHls],
  );

  const persistSeriesPlaybackPreference = useCallback(
    async (payload: {
      preferredAudioLanguage?: string | null;
      preferredSubtitleLanguage?: string | null;
      subtitlePreferenceEnabled?: boolean | null;
    }) => {
      if (!mediaId || media?.type !== 'show') {
        return;
      }

      const seriesPreferenceKey = normalizeShowKey(media).trim();
      if (!seriesPreferenceKey) {
        return;
      }

      const video = videoRef.current;
      const safeVideoDuration = Number.isFinite(video?.duration)
        ? Number(video?.duration)
        : totalDuration;
      const syncTimestampMs = Math.max(
        Date.now(),
        progressSyncTimestampRef.current + 1,
      );
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(token, mediaId, {
          positionSeconds: Math.max(0, Math.floor(video?.currentTime ?? currentTime)),
          durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
          syncTimestampMs,
          completed: false,
          seriesPreferenceKey,
          ...payload,
        });
      } catch {
        // Keep playback uninterrupted if preference persistence fails.
      }
    },
    [currentTime, media, mediaId, token, totalDuration],
  );

  const handleSelectAudioTrack = useCallback(
    (audioStreamIndex: number) => {
      if (selectedAudioStreamIndex === audioStreamIndex) {
        return;
      }

      setSelectedAudioStreamIndex(audioStreamIndex);

      const selectedTrack =
        audioTracks.find((track) => track.streamIndex === audioStreamIndex) ?? null;
      void persistSeriesPlaybackPreference({
        preferredAudioLanguage: selectedTrack?.language ?? null,
      });

      const defaultAudioStreamIndex =
        audioTracks.find((track) => track.isDefault)?.streamIndex
        ?? audioTracks[0]?.streamIndex
        ?? null;

      if (source?.hls) {
        const requiresRestart = source.audioStreamIndex !== audioStreamIndex;
        if (requiresRestart) {
          void switchToHls({
            forceFresh: true,
            audioStreamIndex,
          });
        }
        return;
      }

      if (
        defaultAudioStreamIndex !== null
        && audioStreamIndex !== defaultAudioStreamIndex
      ) {
        void switchToHls({ audioStreamIndex });
      }
    },
    [
      audioTracks,
      persistSeriesPlaybackPreference,
      selectedAudioStreamIndex,
      setSelectedAudioStreamIndex,
      source?.audioStreamIndex,
      source?.hls,
      switchToHls,
    ],
  );

  const handleSelectSubtitle = useCallback(
    (subtitleId: string) => {
      setSelectedSubtitleId(subtitleId);
      setSubtitleVisible(subtitleId !== '');

      const selectedTrack = subtitleId
        ? subtitleTracks.find((track) => track.id === subtitleId) ?? null
        : null;

      void persistSeriesPlaybackPreference({
        preferredSubtitleLanguage: selectedTrack?.language ?? null,
        subtitlePreferenceEnabled: subtitleId !== '',
      });
    },
    [persistSeriesPlaybackPreference, setSelectedSubtitleId, subtitleTracks],
  );

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

  const redactedStreamUrl = useMemo(() => {
    return redactAccessToken(source?.url);
  }, [source?.url]);

  const canUsePictureInPicture = useMemo(() => Boolean(document.pictureInPictureEnabled), []);

  const {
    canCast,
    castDeviceAvailable,
    isCasting,
    openCastPicker,
  } = usePlayerCasting({
    videoRef,
    sourceUrl: source?.url ?? null,
    sourceIsHls: Boolean(source?.hls),
    mediaTitle: playerTitle,
    setPlayerError,
  });

  const { clearControlsTimer, scheduleControlsAutoHide, revealControls } =
    usePlayerControlsTimer({ isPlaying, isSeeking, setIsControlsVisible });

  const syncProgress = useCallback(
    async (completed = false, keepalive = false) => {
      const video = videoRef.current;
      if (!video || !mediaId) {
        return;
      }

      const safeVideoDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
      const syncTimestampMs = Math.max(
        Date.now(),
        progressSyncTimestampRef.current + 1,
      );
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(
          token,
          mediaId,
          {
            positionSeconds: Math.max(0, Math.floor(video.currentTime || 0)),
            durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
            syncTimestampMs,
            completed,
          },
          { keepalive },
        );
      } catch {
        // Keep playback uninterrupted if progress persistence fails.
      }
    },
    [mediaId, token, totalDuration],
  );

  const {
    seekTo,
    skipBy,
    applyVolume,
    togglePlay,
    toggleMute,
    toggleSubtitleVisibility,
    toggleFullscreen,
    togglePictureInPicture,
    adjustPlaybackRate,
  } = usePlayerInteractions({
    videoRef,
    videoShellRef,
    totalDuration,
    currentTime,
    muted,
    volume,
    source,
    selectedSubtitle,
    subtitleTracks,
    canUsePictureInPicture,
    revealControls,
    setSelectedSubtitleId,
    setSubtitleVisible,
    setVolume,
    setMuted,
    setPlaybackRate,
    setCurrentTime,
    setSeekValue,
    setPlayerError,
    setIsPictureInPicture,
  });

  usePlayerKeyboardShortcuts({
    enabled: !hideTopNav,
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
    subtitleFontPreset,
    videoRef,
    sourceUrl: source?.url ?? null,
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

  const handleVideoEndedWithAutoNext = useMemo(
    () => withAutoAdvance(handleVideoEnded),
    [handleVideoEnded, withAutoAdvance],
  );

  const activeTheaterMode = hideTopNav ? false : theaterMode;

  const playerPageClassName = hideTopNav
    ? 'player-page phone-player-page'
    : 'player-page';

  return (
    <main className={playerPageClassName}>
      {headerContent}

      {!hideTopNav ? (
        <PlayerTopBar
          title={playerTitle}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearch}
          onBack={handleBackNavigation}
          onOpenRandomDetails={openRandomDetails}
          user={user}
          onLogout={onLogout}
        />
      ) : null}

      {loading ? <p className="muted">Preparing stream...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {playerError ? <p className="error-text">{playerError}</p> : null}
      {switchingToHls ? <p className="muted">Switching to transcoded stream...</p> : null}

      <PlayerDownloadProgress torrent={downloadingTorrent} />

      <section className={`player-layout ${activeTheaterMode ? 'player-layout-theater' : ''}`}>
        <PlayerVideoPanel
          token={token}
          media={media}
          audioTracks={audioTracks}
          selectedAudioStreamIndex={selectedAudioStreamIndex}
          onSelectAudioTrack={handleSelectAudioTrack}
          activeSubtitle={activeSubtitle}
          subtitleTracks={subtitleTracks}
          selectedSubtitleId={selectedSubtitleId}
          onSelectSubtitle={handleSelectSubtitle}
          onExtractSubtitle={(track) => {
            setSubtitleVisible(true);
            void persistSeriesPlaybackPreference({
              preferredSubtitleLanguage: track.language ?? null,
              subtitlePreferenceEnabled: true,
            });
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
          canCast={canCast}
          castDeviceAvailable={castDeviceAvailable}
          isCasting={isCasting}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          subtitleFontPreset={subtitleFontPreset}
          theaterMode={activeTheaterMode}
          isPhoneMode={hideTopNav}
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
          showNerdStats={showNerdStats}
          streamSessionId={source?.hlsSessionId ?? null}
          streamUrl={redactedStreamUrl}
          hlsSessionStats={hlsSessionStats}
          hlsSessionStatsError={hlsSessionStatsError}
          hlsSessionStatsUpdatedAt={hlsSessionStatsUpdatedAt}
          videoTelemetry={videoTelemetry}
          downloadingTorrent={downloadingTorrent}
          onRevealControls={revealControls}
          onHideControls={hideControls}
          onToggleNerdStats={toggleNerdStats}
          onTogglePlay={() => { void togglePlay(); }}
          onToggleFullscreen={() => { void toggleFullscreen(); }}
          onToggleMute={toggleMute}
          onToggleTheaterMode={handleToggleTheaterMode}
          onTogglePictureInPicture={() => { void togglePictureInPicture(); }}
          onOpenCastPicker={() => { void openCastPicker(); }}
          onSkipBy={skipBy}
          onSeekTo={seekTo}
          onApplyVolume={applyVolume}
          onPlaybackRateChange={handlePlaybackRateChange}
          onSubtitleFontPresetChange={setSubtitleFontPreset}
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

      <PlayerEpisodeNavigation
        isShowMedia={media?.type === 'show'}
        previousEpisode={previousEpisode}
        nextEpisode={nextEpisode}
        previousEpisodeImage={previousEpisodeImage}
        nextEpisodeImage={nextEpisodeImage}
        onNavigateToEpisode={(episodeId) => navigate(`/player/${episodeId}`)}
      />

      <PlayerDetails
        media={media}
        totalDuration={totalDuration}
        currentTime={currentTime}
        showKeyboardShortcuts={!hideTopNav}
      />
    </main>
  );
}
