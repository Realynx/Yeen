import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlayerPlaybackPageView } from '../components/PlayerPlaybackPageView';
import type { User } from '../../shared/services/types';
import { usePlayerData } from '../services/usePlayerData';
import { usePlayerMediaSource } from '../services/usePlayerMediaSource';
import { usePlayerDiagnostics } from '../services/usePlayerDiagnostics';
import { useShowEpisodes } from '../services/useShowEpisodes';
import { usePlayerPreferenceState } from '../services/usePlayerPreferenceState';
import { usePlayerSeriesPlaybackPreferences } from '../services/usePlayerSeriesPlaybackPreferences';
import { usePlayerPlaybackRuntime } from '../services/usePlayerPlaybackRuntime';
import { usePlayerTopBarActions } from '../services/usePlayerTopBarActions';
import { usePlayerScrubbingClass } from '../services/usePlayerScrubbingClass';
import {
  clamp,
} from '../services/playerUtils';
import { usePlayerQualityPreferences } from '../services/usePlayerQualityPreferences';
import { redactAccessToken } from '../services/playerPageUtils';
import { usePlayerPlaybackViewState } from '../services/usePlayerPlaybackViewState';
import { useBroadcast } from '../../broadcast/services/broadcast-context';

interface PlayerPlaybackPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

const BROADCAST_PLAYER_LOCK_RENEW_MS = 2000;
const BROADCAST_PLAYER_LOCK_TTL_MS = 6500;

function toBroadcastSubtitleFileName(subtitleUrl: string | null): string | null {
  if (!subtitleUrl) {
    return null;
  }

  try {
    const parsed = new URL(subtitleUrl, 'http://localhost');
    const segments = parsed.pathname.split('/');
    const fileIndex = segments.findIndex((segment) => segment === 'file');

    if (fileIndex < 0 || fileIndex >= segments.length - 2) {
      return null;
    }

    const encodedFileName = segments.slice(fileIndex + 2).join('/');
    if (!encodedFileName) {
      return null;
    }

    const decoded = decodeURIComponent(encodedFileName).trim();
    if (!decoded) {
      return null;
    }

    if (decoded.includes('/') || decoded.includes('\\')) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function PlayerPlaybackPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPlaybackPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    isEnabled: broadcastEnabled,
    updateSource: updateBroadcastSource,
    updatePlayback: updateBroadcastPlayback,
  } = useBroadcast();
  const [hasBroadcastPlayerLock, setHasBroadcastPlayerLock] = useState(false);
  const broadcastPlayerInstanceIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
  );
  const broadcastPlayerLockKey = useMemo(
    () => `yeen_broadcast_player_lock_${user.id}`,
    [user.id],
  );

  const {
    query,
    setQuery,
    handleSearch,
    handleBackNavigation,
    openRandomDetails,
    openCurrentDetails,
  } = usePlayerTopBarActions({ token, mediaId, navigate });

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [mediaId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const progressSyncTimestampRef = useRef(0);
  const hasAppliedInitialSeekRef = useRef(false);
  const broadcastCurrentTimeRef = useRef(0);
  const broadcastIsPlayingRef = useRef(false);
  const broadcastSourceSnapshotRef = useRef<{
    hasHls: boolean;
    mediaId: string | null;
    hlsSessionId: string | null;
    subtitleFileName: string | null;
    selectedAudioStreamIndex: number | null;
    maxVideoBitrateKbps: number | null;
    audioBitrateKbps: number | null;
    maxOutputHeight: number | null;
  }>({
    hasHls: false,
    mediaId: null,
    hlsSessionId: null,
    subtitleFileName: null,
    selectedAudioStreamIndex: null,
    maxVideoBitrateKbps: null,
    audioBitrateKbps: null,
    maxOutputHeight: null,
  });

  const acquireBroadcastPlayerLock = useCallback((): boolean => {
    if (typeof window === 'undefined') {
      return true;
    }

    const nowMs = Date.now();
    const instanceId = broadcastPlayerInstanceIdRef.current;

    let lockHolderInstanceId: string | null = null;
    let lockExpiresAt = 0;

    try {
      const raw = window.localStorage.getItem(broadcastPlayerLockKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          instanceId?: unknown;
          expiresAt?: unknown;
        };

        if (typeof parsed.instanceId === 'string') {
          lockHolderInstanceId = parsed.instanceId;
        }

        if (typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)) {
          lockExpiresAt = parsed.expiresAt;
        }
      }
    } catch {
      lockHolderInstanceId = null;
      lockExpiresAt = 0;
    }

    const lockBelongsToOtherActiveInstance =
      lockHolderInstanceId !== null
      && lockHolderInstanceId !== instanceId
      && lockExpiresAt > nowMs;

    if (lockBelongsToOtherActiveInstance) {
      return false;
    }

    window.localStorage.setItem(
      broadcastPlayerLockKey,
      JSON.stringify({
        instanceId,
        mediaId,
        expiresAt: nowMs + BROADCAST_PLAYER_LOCK_TTL_MS,
      }),
    );

    return true;
  }, [broadcastPlayerLockKey, mediaId]);

  const releaseBroadcastPlayerLock = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const instanceId = broadcastPlayerInstanceIdRef.current;

    try {
      const raw = window.localStorage.getItem(broadcastPlayerLockKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { instanceId?: unknown };
      if (parsed.instanceId === instanceId) {
        window.localStorage.removeItem(broadcastPlayerLockKey);
      }
    } catch {
      // Ignore lock parse failures and leave lock untouched.
    }
  }, [broadcastPlayerLockKey]);

  useEffect(() => {
    if (!broadcastEnabled) {
      setHasBroadcastPlayerLock(false);
      releaseBroadcastPlayerLock();
      return;
    }

    let cancelled = false;

    const renewLock = () => {
      const acquired = acquireBroadcastPlayerLock();
      if (!cancelled) {
        setHasBroadcastPlayerLock(acquired);
      }
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== broadcastPlayerLockKey) {
        return;
      }

      renewLock();
    };

    renewLock();
    const intervalId = window.setInterval(renewLock, BROADCAST_PLAYER_LOCK_RENEW_MS);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleStorageEvent);
      setHasBroadcastPlayerLock(false);
      releaseBroadcastPlayerLock();
    };
  }, [
    acquireBroadcastPlayerLock,
    broadcastEnabled,
    broadcastPlayerLockKey,
    releaseBroadcastPlayerLock,
  ]);

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

  const {
    theaterMode, setTheaterMode, volume, setVolume, muted, setMuted, playbackRate,
    setPlaybackRate, subtitleFontPreset, setSubtitleFontPreset, preferredVideoBitrateKbps,
    setPreferredVideoBitrateKbps, preferredAudioBitrateKbps, setPreferredAudioBitrateKbps,
    preferredMaxResolutionHeight, setPreferredMaxResolutionHeight, accountVideoQuotaKbps,
    effectivePreferredVideoBitrateKbps, effectivePreferredAudioBitrateKbps,
    maxResolutionForBitrateBudget, effectivePreferredMaxResolutionHeight, transcodePreferences,
  } = usePlayerPreferenceState({ userMaxBitrateKbps: user.maxBitrateKbps });

  const {
    media, source, streamTorrentHash, audioTracks, selectedAudioStreamIndex, subtitleTracks,
    selectedSubtitleId, selectedSubtitle, resumeAtSeconds, loading, error, switchingToHls,
    extractingSubtitleTrackId, setSelectedAudioStreamIndex, setSelectedSubtitleId, extractTrack,
    switchToHls,
  } = usePlayerData(token, mediaId, transcodePreferences);

  const {
    downloadingTorrent, showNerdStats, hlsSessionStats, hlsSessionStatsError,
    hlsSessionStatsUpdatedAt, videoTelemetry, toggleNerdStats,
  } = usePlayerDiagnostics({ token, source, streamTorrentHash, videoRef });

  usePlayerScrubbingClass(isSeeking);

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
    previousEpisode, nextEpisode, previousEpisodeImage, nextEpisodeImage, withAutoAdvance,
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
        maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
        audioBitrateKbps: effectivePreferredAudioBitrateKbps,
        maxOutputHeight: effectivePreferredMaxResolutionHeight,
      }),
    [
      effectivePreferredAudioBitrateKbps,
      effectivePreferredMaxResolutionHeight,
      effectivePreferredVideoBitrateKbps,
      selectedAudioStreamIndex,
      switchToHls,
    ],
  );

  const { persistSeriesPlaybackPreference, handleSelectAudioTrack, handleSelectSubtitle } =
    usePlayerSeriesPlaybackPreferences({
    token,
    mediaId,
    media,
    currentTime,
    totalDuration,
    videoRef,
    progressSyncTimestampRef,
    audioTracks,
    selectedAudioStreamIndex,
    setSelectedAudioStreamIndex,
    subtitleTracks,
    setSelectedSubtitleId,
    setSubtitleVisible,
    source,
    switchToHls,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
  });

  useEffect(() => {
    broadcastCurrentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    broadcastIsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    broadcastSourceSnapshotRef.current = {
      hasHls: Boolean(source?.hls),
      mediaId: mediaId || null,
      hlsSessionId: source?.hls ? source.hlsSessionId : null,
      subtitleFileName: toBroadcastSubtitleFileName(activeSubtitle?.url ?? null),
      selectedAudioStreamIndex,
      maxVideoBitrateKbps: source?.hls ? source.maxVideoBitrateKbps : null,
      audioBitrateKbps: source?.hls ? source.audioBitrateKbps : null,
      maxOutputHeight: source?.hls ? source.maxOutputHeight : null,
    };
  }, [
    activeSubtitle?.url,
    mediaId,
    selectedAudioStreamIndex,
    source?.audioBitrateKbps,
    source?.hls,
    source?.hlsSessionId,
    source?.maxOutputHeight,
    source?.maxVideoBitrateKbps,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !mediaId
      || loading
      || switchingToHls
    ) {
      return;
    }

    if (!source || source.hls) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    });
  }, [
    broadcastEnabled,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    loading,
    hasBroadcastPlayerLock,
    mediaId,
    selectedAudioStreamIndex,
    source,
    switchToHls,
    switchingToHls,
  ]);

  useEffect(() => {
    if (!broadcastEnabled || !hasBroadcastPlayerLock) {
      return;
    }

    const sourceSnapshot = broadcastSourceSnapshotRef.current;
    if (
      !sourceSnapshot.hasHls
      || !sourceSnapshot.hlsSessionId
      || !sourceSnapshot.mediaId
    ) {
      void updateBroadcastSource(null);
      return;
    }

    void updateBroadcastSource({
      mediaId: sourceSnapshot.mediaId,
      hlsSessionId: sourceSnapshot.hlsSessionId,
      subtitleFileName: sourceSnapshot.subtitleFileName,
      selectedAudioStreamIndex: sourceSnapshot.selectedAudioStreamIndex,
      maxVideoBitrateKbps: sourceSnapshot.maxVideoBitrateKbps,
      audioBitrateKbps: sourceSnapshot.audioBitrateKbps,
      maxOutputHeight: sourceSnapshot.maxOutputHeight,
    });
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    mediaId,
    selectedAudioStreamIndex,
    source?.audioBitrateKbps,
    source?.hls,
    source?.hlsSessionId,
    source?.maxOutputHeight,
    source?.maxVideoBitrateKbps,
    updateBroadcastSource,
  ]);

  useEffect(() => {
    if (!broadcastEnabled || !hasBroadcastPlayerLock) {
      return;
    }

    function pushPlaybackState() {
      const sourceSnapshot = broadcastSourceSnapshotRef.current;
      const shouldPlay =
        broadcastIsPlayingRef.current
        && sourceSnapshot.hasHls
        && Boolean(sourceSnapshot.hlsSessionId);

      void updateBroadcastPlayback({
        positionSeconds: broadcastCurrentTimeRef.current,
        playbackIsPlaying: shouldPlay,
        activePlayer: true,
        syncTimestampMs: Date.now(),
      });
    }

    pushPlaybackState();

    const intervalId = window.setInterval(() => {
      pushPlaybackState();
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    mediaId,
    updateBroadcastPlayback,
  ]);

  useEffect(() => {
    // Keep local visibility state aligned when subtitle selection changes externally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtitleVisible(selectedSubtitleId !== '');
  }, [mediaId, selectedSubtitleId]);

  const {
    hlsLevels,
    qualityMode,
    setQualityMode,
    currentAutoLevel,
    estimatedBandwidthBps,
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

  const {
    effectiveVideoBitrateQuotaKbps, resolutionHeightOptions, videoBitrateOptionsKbps,
    audioBitrateOptionsKbps, handlePreferredVideoBitrateChange,
    handlePreferredAudioBitrateChange, handlePreferredResolutionChange,
  } = usePlayerQualityPreferences({
    source,
    accountVideoQuotaKbps,
    maxResolutionForBitrateBudget,
    preferredMaxResolutionHeight,
    setPreferredVideoBitrateKbps,
    setPreferredAudioBitrateKbps,
    setPreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    selectedAudioStreamIndex,
    switchToHls,
  });

  const redactedStreamUrl = useMemo(() => {
    return redactAccessToken(source?.url);
  }, [source?.url]);

  const runtime = usePlayerPlaybackRuntime({
    token,
    mediaId,
    hideTopNav,
    playerTitle,
    source,
    switchingToHls,
    selectedSubtitle,
    subtitleTracks,
    activeSubtitleUrl: activeSubtitle?.url ?? null,
    requestedStartSeconds,
    resumeAtSeconds,
    totalDuration,
    currentTime,
    seekValue,
    isPlaying,
    isSeeking,
    muted,
    volume,
    playbackRate,
    theaterMode,
    subtitleFontPreset,
    preferredVideoBitrateKbps,
    preferredAudioBitrateKbps,
    preferredMaxResolutionHeight,
    videoRef,
    videoShellRef,
    hasAppliedInitialSeekRef,
    progressSyncTimestampRef,
    attemptedHlsFallbackRef,
    setSelectedSubtitleId,
    setSubtitleVisible,
    setVolume,
    setMuted,
    setPlaybackRate,
    setCurrentTime,
    setSeekValue,
    setSeekPreviewSeconds,
    setDuration,
    setBufferedPercent,
    setIsSeeking,
    setIsPlaying,
    setIsBuffering,
    setIsControlsVisible,
    setIsPictureInPicture,
    setIsFullscreen,
    setPlayerError,
    setQualityMode,
    setTheaterMode,
    switchToHls,
    withAutoAdvance,
  });

  const {
    activeTheaterMode, playerPageClassName, panelProps, episodeNavigationProps, detailsProps,
  } = usePlayerPlaybackViewState({
    token, hideTopNav, theaterMode, media, source, redactedStreamUrl,
    trackState: { audioTracks, selectedAudioStreamIndex, subtitleTracks, selectedSubtitleId, extractingSubtitleTrackId },
    playbackState: {
      activeSubtitle, isControlsVisible, isPlaying, isSeeking, isBuffering, isFullscreen,
      isPictureInPicture, muted, volume, playbackRate, subtitleFontPreset, currentTime,
      totalDuration, safeDuration, playedPercent, bufferedPercent, seekValue, seekPreviewSeconds,
    },
    capabilities: {
      canUsePictureInPicture: runtime.canUsePictureInPicture,
      canCast: runtime.canCast,
      castDeviceAvailable: runtime.castDeviceAvailable,
      isCasting: runtime.isCasting,
    },
    qualityStateBase: {
      estimatedBandwidthBps, hlsLevels, qualityMode, videoBitrateQuotaKbps: effectiveVideoBitrateQuotaKbps,
      videoBitrateOptionsKbps, audioBitrateOptionsKbps, resolutionHeightOptions,
      preferredVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      preferredAudioBitrateKbps: effectivePreferredAudioBitrateKbps,
      preferredMaxResolutionHeight: effectivePreferredMaxResolutionHeight,
    },
    sourceHasHls: Boolean(source?.hls), currentAutoLevel,
    diagnostics: {
      showNerdStats,
      hlsSessionStats,
      hlsSessionStatsError,
      hlsSessionStatsUpdatedAt,
      videoTelemetry,
      downloadingTorrent,
      toggleNerdStats,
    },
    refs: { videoRef, videoShellRef },
    runtime,
    selectionHandlers: {
      onSelectAudioTrack: handleSelectAudioTrack,
      onSelectSubtitle: handleSelectSubtitle,
    },
    extractSubtitleContext: {
      setSelectedSubtitleId,
      setSubtitleVisible,
      persistSeriesPlaybackPreference,
      extractTrack,
    },
    preferenceHandlers: {
      onSubtitleFontPresetChange: setSubtitleFontPreset,
      onQualityModeChange: runtime.handleQualityModeChange,
      onPreferredVideoBitrateChange: handlePreferredVideoBitrateChange,
      onPreferredAudioBitrateChange: handlePreferredAudioBitrateChange,
      onPreferredResolutionChange: handlePreferredResolutionChange,
    },
    episodeNavigationContext: { previousEpisode, nextEpisode, previousEpisodeImage, nextEpisodeImage, navigate },
    detailsContext: { totalDuration, currentTime, onOpenDetails: openCurrentDetails },
  });

  return (
    <PlayerPlaybackPageView
      playerPageClassName={playerPageClassName}
      hideTopNav={hideTopNav}
      headerContent={headerContent}
      playerTitle={playerTitle}
      query={query}
      onQueryChange={setQuery}
      onSearchSubmit={handleSearch}
      onBack={handleBackNavigation}
      onOpenRandomDetails={openRandomDetails}
      user={user}
      onLogout={onLogout}
      loading={loading}
      switchingToHls={switchingToHls}
      error={error}
      playerError={playerError}
      activeTheaterMode={activeTheaterMode}
      panelProps={panelProps}
      episodeNavigationProps={episodeNavigationProps}
      detailsProps={detailsProps}
      downloadingTorrent={downloadingTorrent}
    />
  );
}
