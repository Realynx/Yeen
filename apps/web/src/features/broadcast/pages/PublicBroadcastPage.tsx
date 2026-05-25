import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Hls, { type ErrorData } from 'hls.js';
import {
  absoluteApiUrl,
  getPublicBroadcastSubtitleTracks,
  getPublicBroadcastSession,
  heartbeatPublicBroadcastViewer,
  toApiErrorMessage,
} from '../../shared/services/api';
import { createHlsInstance } from '../../player/services/hls/createHls';
import {
  normalizeSubtitleFontPreset,
  SUBTITLE_FONT_OPTIONS,
} from '../../player/services/playerUtils';
import { setupSubtitleTrackSync } from '../../player/services/subtitleTrackSync';
import {
  type BroadcastStatusSnapshot,
  type PlaybackSyncRuntime,
  resolveBroadcastTargetPosition,
  SEEK_GUARD_WINDOW_MS,
  syncVideoToBroadcastStatus,
} from '../services/publicBroadcastPlaybackSync';
import {
  type PublicBroadcastSyncState,
  resolvePublicBroadcastSyncState,
  resolveSourceEpochTransition,
  shouldRunStallRecovery,
} from '../services/publicBroadcastSyncState';
import './public-broadcast-page.css';

const STATUS_AND_SYNC_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;
const STALL_RECOVERY_COOLDOWN_MS = 2000;
const WATCHDOG_RECOVERY_COOLDOWN_MS = 3000;
const WATCHDOG_SESSION_RELOAD_SETTLE_MS = 5000;
const PLAYBACK_WATCHDOG_INTERVAL_MS = 2000;
const PLAYBACK_STALL_WINDOW_MS = 7000;
const FRAGMENT_STALL_WINDOW_MS = 9000;
const PLAYBACK_PROGRESS_DELTA_SECONDS = 0.15;
const MIN_EXPECTED_PROGRESS_FACTOR = 0.35;
const WEAK_PROGRESS_SAMPLE_THRESHOLD = 3;
const LOW_BUFFER_AHEAD_SECONDS = 0.4;
const SEGMENT_503_WINDOW_MS = 30000;
const MAX_SEGMENT_503S_PER_WINDOW = 6;
const NETWORK_RECOVERY_RESET_WINDOW_MS = 12000;

function resolveBufferedAheadSeconds(
  video: HTMLVideoElement,
  currentTime: number,
): number {
  const ranges = video.buffered;
  for (let i = 0; i < ranges.length; i += 1) {
    const start = ranges.start(i);
    const end = ranges.end(i);
    if (currentTime >= start && currentTime <= end) {
      return Math.max(0, end - currentTime);
    }
  }

  return 0;
}

interface PublicBroadcastPageProps {
  shareToken?: string;
}

export function PublicBroadcastPage({ shareToken }: PublicBroadcastPageProps) {
  const resolvedShareToken = shareToken?.trim() || '';

  const [statusSnapshot, setStatusSnapshot] = useState<BroadcastStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(resolvedShareToken));
  const [error, setError] = useState<string | null>(null);
  const [showStartPlaybackButton, setShowStartPlaybackButton] = useState(false);
  const [fallbackSubtitleState, setFallbackSubtitleState] = useState<{
    key: string;
    url: string | null;
  }>({ key: '', url: null });
  const [failedPrimarySubtitleKey, setFailedPrimarySubtitleKey] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const manifestUrlRef = useRef<string | null>(null);
  const statusRef = useRef<BroadcastStatusSnapshot | null>(null);
  const syncStateRef = useRef<PublicBroadcastSyncState>('offline');
  const activeSourceEpochRef = useRef<number | null>(null);
  const runPlaybackSyncRef = useRef<() => void>(() => {
    // Initialized after first render.
  });
  const suppressSeekGuardUntilRef = useRef(0);
  const lastStallRecoveryAtRef = useRef(0);
  const playbackWatchdogRef = useRef({
    lastObservedCurrentTime: 0,
    lastObservedAtMs: 0,
    lastPlaybackProgressAtMs: 0,
    lastFragmentLoadedAtMs: 0,
    consecutiveWeakProgressSamples: 0,
    recoveryStage: 0,
  });
  const hlsRecoveryStateRef = useRef({
    attemptedNetworkRecovery: false,
    restartedSession: false,
    lastNetworkRecoveryAtMs: 0,
    segment503WindowStartedAtMs: 0,
    segment503Count: 0,
  });
  const syncRuntimeRef = useRef<PlaybackSyncRuntime>({
    lastManifestUrl: null,
    lastManifestAppliedAtMs: 0,
    lastHardSyncAtMs: 0,
    smoothedDriftSeconds: 0,
  });

  const resetHlsRecoveryState = useCallback(() => {
    hlsRecoveryStateRef.current = {
      attemptedNetworkRecovery: false,
      restartedSession: false,
      lastNetworkRecoveryAtMs: 0,
      segment503WindowStartedAtMs: 0,
      segment503Count: 0,
    };
  }, []);

  const resetPlaybackWatchdog = useCallback(() => {
    playbackWatchdogRef.current = {
      lastObservedCurrentTime: 0,
      lastObservedAtMs: 0,
      lastPlaybackProgressAtMs: 0,
      lastFragmentLoadedAtMs: 0,
      consecutiveWeakProgressSamples: 0,
      recoveryStage: 0,
    };
  }, []);

  const destroyHlsInstance = useCallback(() => {
    const activeHls = hlsRef.current;
    if (!activeHls) {
      return;
    }

    activeHls.destroy();
    hlsRef.current = null;
    resetHlsRecoveryState();
  }, [resetHlsRecoveryState]);

  const attachHlsRecovery = useCallback((hls: Hls) => {
    resetHlsRecoveryState();

    hls.on(Hls.Events.FRAG_LOADED, () => {
      // Successful fragment fetch means retry ladder can safely reset.
      hlsRecoveryStateRef.current.attemptedNetworkRecovery = false;
      hlsRecoveryStateRef.current.restartedSession = false;
      hlsRecoveryStateRef.current.segment503WindowStartedAtMs = 0;
      hlsRecoveryStateRef.current.segment503Count = 0;
      const nowMs = Date.now();
      playbackWatchdogRef.current.lastFragmentLoadedAtMs = nowMs;
      if (playbackWatchdogRef.current.lastPlaybackProgressAtMs === 0) {
        playbackWatchdogRef.current.lastPlaybackProgressAtMs = nowMs;
      }
      playbackWatchdogRef.current.consecutiveWeakProgressSamples = 0;
      playbackWatchdogRef.current.recoveryStage = 0;
      setError(null);
    });

    hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
      const statusCode = getErrorResponseStatus(data);

      if (
        statusCode === 503
        && shouldRestartForPersistentSegment503(data)
      ) {
        const currentManifestUrl = manifestUrlRef.current;
        if (currentManifestUrl) {
          try {
            setError('Stream is buffering. Retrying segment fetch...');
            resetHlsRecoveryState();
            resetPlaybackWatchdog();
            hls.stopLoad();
            hls.loadSource(currentManifestUrl);
            hls.startLoad(-1);
            return;
          } catch {
            // Fall through to fatal escalation handling below.
          }
        }
      }

      if (!data.fatal) {
        return;
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        const recovery = hlsRecoveryStateRef.current;
        const nowMs = Date.now();

        if (
          recovery.lastNetworkRecoveryAtMs > 0
          && nowMs - recovery.lastNetworkRecoveryAtMs > NETWORK_RECOVERY_RESET_WINDOW_MS
        ) {
          recovery.attemptedNetworkRecovery = false;
          recovery.restartedSession = false;
        }

        recovery.lastNetworkRecoveryAtMs = nowMs;

        if (!recovery.attemptedNetworkRecovery) {
          recovery.attemptedNetworkRecovery = true;
          try {
            hls.startLoad();
          } catch {
            // Fall through to session restart on the next fatal network error.
          }
          return;
        }

        if (!recovery.restartedSession) {
          recovery.restartedSession = true;
          const currentManifestUrl = manifestUrlRef.current;

          if (currentManifestUrl) {
            try {
              hls.stopLoad();
              hls.loadSource(currentManifestUrl);
              hls.startLoad(-1);
              return;
            } catch {
              // Escalate to full hls instance reset below.
            }
          }
        }
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try {
          hls.recoverMediaError();
          return;
        } catch {
          // If media recovery throws, escalate to full reset below.
        }
      }

      syncStateRef.current = 'recover_manifest';
      setError('Playback stalled. Reconnecting stream...');
      manifestUrlRef.current = null;
      destroyHlsInstance();
      window.setTimeout(() => {
        syncStateRef.current = resolvePublicBroadcastSyncState(statusRef.current?.status ?? null);
        runPlaybackSyncRef.current();
      }, 0);
    });

    function shouldRestartForPersistentSegment503(data: ErrorData): boolean {
      if (data.type !== Hls.ErrorTypes.NETWORK_ERROR) {
        return false;
      }

      if (!isSegmentError(data)) {
        return false;
      }

      const recovery = hlsRecoveryStateRef.current;
      const nowMs = Date.now();

      if (
        recovery.segment503WindowStartedAtMs === 0
        || nowMs - recovery.segment503WindowStartedAtMs > SEGMENT_503_WINDOW_MS
      ) {
        recovery.segment503WindowStartedAtMs = nowMs;
        recovery.segment503Count = 0;
      }

      recovery.segment503Count += 1;
      return recovery.segment503Count >= MAX_SEGMENT_503S_PER_WINDOW;
    }

    function isSegmentError(data: ErrorData): boolean {
      const frag = (data as unknown as { frag?: { sn?: number | string } }).frag;
      if (!frag || typeof frag !== 'object') {
        return false;
      }

      const segmentIndex =
        typeof frag.sn === 'number'
          ? frag.sn
          : typeof frag.sn === 'string'
            ? Number.parseInt(frag.sn, 10)
            : Number.NaN;

      return Number.isFinite(segmentIndex) && segmentIndex >= 0;
    }

    function getErrorResponseStatus(data: ErrorData): number | null {
      const response = (data as unknown as {
        response?: { code?: number; status?: number };
      }).response;

      if (!response || typeof response !== 'object') {
        return null;
      }

      if (typeof response.code === 'number' && Number.isFinite(response.code)) {
        return response.code;
      }

      if (typeof response.status === 'number' && Number.isFinite(response.status)) {
        return response.status;
      }

      return null;
    }
  }, [destroyHlsInstance, resetHlsRecoveryState, resetPlaybackWatchdog]);

  const applyManifestUrl = useCallback((nextManifestUrl: string) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const manifestChanged = manifestUrlRef.current !== nextManifestUrl;
    if (manifestChanged) {
      resetHlsRecoveryState();
      resetPlaybackWatchdog();
      lastStallRecoveryAtRef.current = 0;
    }

    const supportsNativeHls = Boolean(
      video.canPlayType('application/vnd.apple.mpegurl'),
    );

    if (!supportsNativeHls && Hls.isSupported()) {
      let activeHls = hlsRef.current;
      if (!activeHls) {
        activeHls = createHlsInstance();
        attachHlsRecovery(activeHls);
        hlsRef.current = activeHls;
        activeHls.attachMedia(video);
      }

      activeHls.loadSource(nextManifestUrl);
      manifestUrlRef.current = nextManifestUrl;
      return;
    }

    destroyHlsInstance();

    if (video.src !== nextManifestUrl) {
      video.src = nextManifestUrl;
      video.load();
    }

    manifestUrlRef.current = nextManifestUrl;
  }, [
    attachHlsRecovery,
    destroyHlsInstance,
    resetHlsRecoveryState,
    resetPlaybackWatchdog,
  ]);

  const status = statusSnapshot?.status ?? null;

  useEffect(() => {
    statusRef.current = statusSnapshot;
  }, [statusSnapshot]);

  useEffect(() => {
    syncStateRef.current = resolvePublicBroadcastSyncState(status);
  }, [status]);

  useEffect(() => {
    const transition = resolveSourceEpochTransition(
      activeSourceEpochRef.current,
      status,
    );
    activeSourceEpochRef.current = transition.nextSourceEpoch;

    if (!transition.shouldResetManifest) {
      return;
    }

    syncStateRef.current = 'recover_manifest';
    manifestUrlRef.current = null;
    syncRuntimeRef.current = {
      lastManifestUrl: null,
      lastManifestAppliedAtMs: 0,
      lastHardSyncAtMs: 0,
      smoothedDriftSeconds: 0,
    };
    resetPlaybackWatchdog();
    suppressSeekGuardUntilRef.current = 0;
    lastStallRecoveryAtRef.current = 0;
    destroyHlsInstance();

    window.setTimeout(() => {
      syncStateRef.current = resolvePublicBroadcastSyncState(
        statusRef.current?.status ?? null,
      );
      runPlaybackSyncRef.current();
    }, 0);
  }, [destroyHlsInstance, resetPlaybackWatchdog, status]);

  const runPlaybackSync = useCallback(() => {
    const activeStatusSnapshot = statusRef.current;
    const video = videoRef.current;

    if (!video || !activeStatusSnapshot) {
      return;
    }

    syncVideoToBroadcastStatus(
      video,
      activeStatusSnapshot.status,
      activeStatusSnapshot.receivedAtMs,
      syncRuntimeRef,
      suppressSeekGuardUntilRef,
      {
        currentManifestUrl: manifestUrlRef.current,
        applyManifest: applyManifestUrl,
      },
    );
  }, [applyManifestUrl]);

  useEffect(() => {
    runPlaybackSyncRef.current = runPlaybackSync;
  }, [runPlaybackSync]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      resetPlaybackWatchdog();
      lastStallRecoveryAtRef.current = Date.now();
      runPlaybackSyncRef.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [resetPlaybackWatchdog]);

  useEffect(() => {
    if (status?.isLive && status.manifestUrl) {
      return;
    }

    manifestUrlRef.current = null;
    lastStallRecoveryAtRef.current = 0;
    resetPlaybackWatchdog();
    destroyHlsInstance();
  }, [destroyHlsInstance, resetPlaybackWatchdog, status?.isLive, status?.manifestUrl]);

  useEffect(() => {
    return () => {
      manifestUrlRef.current = null;
      resetPlaybackWatchdog();
      destroyHlsInstance();
    };
  }, [destroyHlsInstance, resetPlaybackWatchdog]);

  const viewerStorageKey = useMemo(() => {
    if (!resolvedShareToken) {
      return null;
    }

    return `yeen_public_broadcast_viewer_${resolvedShareToken}`;
  }, [resolvedShareToken]);

  const ensureViewerId = useCallback(() => {
    if (!viewerStorageKey) {
      return '';
    }

    const storedViewerId = localStorage.getItem(viewerStorageKey)?.trim() ?? '';
    if (storedViewerId) {
      return storedViewerId;
    }

    const generatedViewerId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

    localStorage.setItem(viewerStorageKey, generatedViewerId);
    return generatedViewerId;
  }, [viewerStorageKey]);

  useEffect(() => {
    if (!resolvedShareToken) {
      return;
    }

    let cancelled = false;

    async function refreshStatus() {
      try {
        const receivedAtMs = Date.now();
        const nextStatus = await getPublicBroadcastSession(resolvedShareToken);
        if (cancelled) {
          return;
        }

        const nextSnapshot: BroadcastStatusSnapshot = {
          status: nextStatus,
          receivedAtMs,
        };

        statusRef.current = nextSnapshot;
        setStatusSnapshot(nextSnapshot);
        setError(null);
        runPlaybackSyncRef.current();
      } catch (statusError) {
        if (!cancelled) {
          setError(toApiErrorMessage(statusError, 'Unable to load broadcast status.'));
          runPlaybackSyncRef.current();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refreshStatus();

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, STATUS_AND_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [resolvedShareToken]);

  useEffect(() => {
    if (!resolvedShareToken) {
      return;
    }

    let cancelled = false;

    async function sendHeartbeat() {
      try {
        const viewerId = ensureViewerId();
        if (!viewerId) {
          return;
        }

        const heartbeat = await heartbeatPublicBroadcastViewer(
          resolvedShareToken,
          viewerId,
        );

        if (cancelled) {
          return;
        }

        setStatusSnapshot((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: {
              ...previous.status,
              viewerCount: heartbeat.viewerCount,
            },
          };
        });
      } catch {
        // Keep stream status polling resilient even when heartbeat fails.
      }
    }

    void sendHeartbeat();

    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [ensureViewerId, resolvedShareToken]);

  useEffect(() => {
    if (!(status?.enabled && status.isLive && status.manifestUrl)) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handlePlaybackStall = () => {
      const activeStatus = statusRef.current?.status;
      if (!activeStatus?.isLive || !activeStatus.playbackIsPlaying) {
        return;
      }

      const nowMs = Date.now();
      if (
        !shouldRunStallRecovery(
          lastStallRecoveryAtRef.current,
          nowMs,
          STALL_RECOVERY_COOLDOWN_MS,
        )
      ) {
        return;
      }

      lastStallRecoveryAtRef.current = nowMs;

      const activeHls = hlsRef.current;
      if (activeHls) {
        try {
          activeHls.startLoad();
        } catch {
          // Ignore and rely on status-driven playback sync.
        }
      }
    };

    video.addEventListener('waiting', handlePlaybackStall);
    video.addEventListener('stalled', handlePlaybackStall);

    return () => {
      video.removeEventListener('waiting', handlePlaybackStall);
      video.removeEventListener('stalled', handlePlaybackStall);
    };
  }, [status?.enabled, status?.isLive, status?.manifestUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      setShowStartPlaybackButton(false);
      return;
    }

    const shouldOfferManualStart = Boolean(
      status?.enabled
      && status.isLive
      && status.manifestUrl
      && status.playbackIsPlaying,
    );

    const syncStartButtonVisibility = () => {
      setShowStartPlaybackButton(shouldOfferManualStart && video.paused);
    };

    syncStartButtonVisibility();

    video.addEventListener('play', syncStartButtonVisibility);
    video.addEventListener('playing', syncStartButtonVisibility);
    video.addEventListener('pause', syncStartButtonVisibility);
    video.addEventListener('loadedmetadata', syncStartButtonVisibility);
    video.addEventListener('loadeddata', syncStartButtonVisibility);
    video.addEventListener('canplay', syncStartButtonVisibility);

    return () => {
      video.removeEventListener('play', syncStartButtonVisibility);
      video.removeEventListener('playing', syncStartButtonVisibility);
      video.removeEventListener('pause', syncStartButtonVisibility);
      video.removeEventListener('loadedmetadata', syncStartButtonVisibility);
      video.removeEventListener('loadeddata', syncStartButtonVisibility);
      video.removeEventListener('canplay', syncStartButtonVisibility);
    };
  }, [
    status?.enabled,
    status?.isLive,
    status?.manifestUrl,
    status?.playbackIsPlaying,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const shouldShowSubtitles = Boolean(
      status?.enabled
      && status.isLive
      && status.manifestUrl
      && status.subtitleUrl,
    );

    const syncSubtitleTrackModes = () => {
      const trackList = video.textTracks;
      let activatedTrack = false;

      for (let i = 0; i < trackList.length; i += 1) {
        const track = trackList[i];
        const isSubtitleTrack =
          track.kind === 'subtitles' || track.kind === 'captions';

        if (!shouldShowSubtitles || !isSubtitleTrack) {
          track.mode = 'disabled';
          continue;
        }

        if (!activatedTrack) {
          track.mode = 'showing';
          activatedTrack = true;
          continue;
        }

        track.mode = 'disabled';
      }
    };

    const syncTimerId = window.setTimeout(syncSubtitleTrackModes, 0);
    video.addEventListener('loadedmetadata', syncSubtitleTrackModes);
    video.addEventListener('loadeddata', syncSubtitleTrackModes);
    video.textTracks.addEventListener('addtrack', syncSubtitleTrackModes);

    return () => {
      window.clearTimeout(syncTimerId);
      video.removeEventListener('loadedmetadata', syncSubtitleTrackModes);
      video.removeEventListener('loadeddata', syncSubtitleTrackModes);
      video.textTracks.removeEventListener('addtrack', syncSubtitleTrackModes);
    };
  }, [
    status?.enabled,
    status?.isLive,
    status?.manifestUrl,
    status?.subtitleUrl,
  ]);

  useEffect(() => {
    if (!(status?.enabled && status.isLive && status.manifestUrl)) {
      resetPlaybackWatchdog();
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      const activeStatus = statusRef.current?.status;
      if (!activeStatus?.isLive || !activeStatus.playbackIsPlaying) {
        resetPlaybackWatchdog();
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      const nowMs = Date.now();
      const watchdog = playbackWatchdogRef.current;
      const currentTime = Number.isFinite(video.currentTime)
        ? video.currentTime
        : watchdog.lastObservedCurrentTime;

      if (watchdog.lastObservedAtMs === 0) {
        watchdog.lastObservedCurrentTime = currentTime;
        watchdog.lastObservedAtMs = nowMs;
        watchdog.lastPlaybackProgressAtMs = nowMs;
        if (watchdog.lastFragmentLoadedAtMs === 0) {
          watchdog.lastFragmentLoadedAtMs = nowMs;
        }
        return;
      }

      const elapsedSinceLastSampleMs = Math.max(1, nowMs - watchdog.lastObservedAtMs);
      const minExpectedProgressSeconds = Math.max(
        PLAYBACK_PROGRESS_DELTA_SECONDS,
        (elapsedSinceLastSampleMs / 1000) * MIN_EXPECTED_PROGRESS_FACTOR,
      );
      const progressed =
        currentTime - watchdog.lastObservedCurrentTime >= minExpectedProgressSeconds;

      watchdog.lastObservedCurrentTime = currentTime;
      watchdog.lastObservedAtMs = nowMs;

      if (progressed) {
        watchdog.lastPlaybackProgressAtMs = nowMs;
        watchdog.consecutiveWeakProgressSamples = 0;
        watchdog.recoveryStage = 0;
        return;
      }

      watchdog.consecutiveWeakProgressSamples += 1;

      if (video.seeking || nowMs < suppressSeekGuardUntilRef.current) {
        return;
      }

      const secondsBufferedAhead = resolveBufferedAheadSeconds(video, currentTime);
      const hardStallDetected =
        nowMs - watchdog.lastPlaybackProgressAtMs >= PLAYBACK_STALL_WINDOW_MS;
      const fragmentFlowStalled =
        nowMs - watchdog.lastFragmentLoadedAtMs >= FRAGMENT_STALL_WINDOW_MS;
      const nearStallDetected =
        watchdog.consecutiveWeakProgressSamples >= WEAK_PROGRESS_SAMPLE_THRESHOLD
        && fragmentFlowStalled
        && secondsBufferedAhead <= LOW_BUFFER_AHEAD_SECONDS;

      if (!hardStallDetected && !nearStallDetected) {
        return;
      }

      if (
        !shouldRunStallRecovery(
          lastStallRecoveryAtRef.current,
          nowMs,
          WATCHDOG_RECOVERY_COOLDOWN_MS,
        )
      ) {
        return;
      }

      lastStallRecoveryAtRef.current = nowMs;

      const activeHls = hlsRef.current;
      if (watchdog.recoveryStage === 0) {
        watchdog.recoveryStage = 1;
        watchdog.consecutiveWeakProgressSamples = 0;
        setError('Playback appears stalled. Retrying stream loader...');

        if (video.paused) {
          void video.play().catch(() => {
            // Ignore and continue with loader nudges.
          });
        }

        if (activeHls) {
          try {
            activeHls.startLoad();
          } catch {
            // Ignore and escalate on next watchdog cycle if needed.
          }
        }

        runPlaybackSyncRef.current();
        return;
      }

      if (watchdog.recoveryStage === 1) {
        watchdog.recoveryStage = 2;
        watchdog.consecutiveWeakProgressSamples = 0;
        const currentManifestUrl = manifestUrlRef.current;

        if (activeHls && currentManifestUrl) {
          try {
            setError('Playback still stalled. Restarting stream session...');
            activeHls.stopLoad();
            activeHls.loadSource(currentManifestUrl);
            activeHls.startLoad(-1);
            resetPlaybackWatchdog();
            lastStallRecoveryAtRef.current =
              nowMs
              + Math.max(
                0,
                WATCHDOG_SESSION_RELOAD_SETTLE_MS - WATCHDOG_RECOVERY_COOLDOWN_MS,
              );
            runPlaybackSyncRef.current();
            return;
          } catch {
            // Fall through to final reconnect path.
          }
        }
      }

      watchdog.recoveryStage = 0;
      watchdog.consecutiveWeakProgressSamples = 0;
      syncStateRef.current = 'recover_manifest';
      setError('Playback remained stalled. Reconnecting stream...');
      manifestUrlRef.current = null;
      destroyHlsInstance();
      runPlaybackSyncRef.current();
    }, PLAYBACK_WATCHDOG_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    destroyHlsInstance,
    resetPlaybackWatchdog,
    status?.enabled,
    status?.isLive,
    status?.manifestUrl,
  ]);

  const isStandbyState = Boolean(status?.enabled && !status.isLive);
  const isLiveState = Boolean(
    status?.enabled
    && status.isLive
    && status.manifestUrl,
  );
  const primarySubtitleUrl = status?.subtitleUrl
    ? absoluteApiUrl(status.subtitleUrl)
    : null;
  const subtitleSelectionKey = `${status?.sourceEpoch ?? 'none'}|${primarySubtitleUrl ?? 'none'}`;
  const primarySubtitleLoadFailed = Boolean(
    primarySubtitleUrl && failedPrimarySubtitleKey === subtitleSelectionKey,
  );
  const fallbackSubtitleUrl =
    fallbackSubtitleState.key === subtitleSelectionKey
      ? fallbackSubtitleState.url
      : null;
  const activeSubtitleUrl =
    !primarySubtitleLoadFailed && primarySubtitleUrl
      ? primarySubtitleUrl
      : fallbackSubtitleUrl;
  const activeSubtitleFontPreset = normalizeSubtitleFontPreset(
    status?.subtitleFontPreset,
  );
  const activeSubtitleFontFamily =
    SUBTITLE_FONT_OPTIONS.find((option) => option.id === activeSubtitleFontPreset)?.family
    ?? SUBTITLE_FONT_OPTIONS[0]?.family
    ?? "'Noto Sans', 'Noto Sans JP', 'Segoe UI', sans-serif";
  const subtitleVideoStyle = useMemo<CSSProperties>(() => {
    return {
      '--player-subtitle-font-family': activeSubtitleFontFamily,
    } as CSSProperties;
  }, [activeSubtitleFontFamily]);

  const viewerLabel = useMemo(() => {
    const viewerCount = status?.viewerCount ?? 0;
    if (viewerCount === 1) {
      return '1 viewer';
    }

    return `${viewerCount} viewers`;
  }, [status?.viewerCount]);

  useEffect(() => {
    if (!resolvedShareToken || !isLiveState) {
      return;
    }

    const needsFallbackTrack =
      primarySubtitleUrl === null || primarySubtitleLoadFailed;
    if (!needsFallbackTrack) {
      return;
    }

    let cancelled = false;

    void getPublicBroadcastSubtitleTracks(resolvedShareToken)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const firstTrackUrl = payload.tracks.find((track) => {
          return typeof track.url === 'string' && track.url.trim().length > 0;
        })?.url;

        const nextFallbackUrl = firstTrackUrl
          ? absoluteApiUrl(firstTrackUrl)
          : null;

        setFallbackSubtitleState((previous) => {
          if (
            previous.key === subtitleSelectionKey
            && previous.url === nextFallbackUrl
          ) {
            return previous;
          }

          return {
            key: subtitleSelectionKey,
            url: nextFallbackUrl,
          };
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFallbackSubtitleState((previous) => {
          if (previous.key === subtitleSelectionKey && previous.url === null) {
            return previous;
          }

          return {
            key: subtitleSelectionKey,
            url: null,
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLiveState,
    primarySubtitleLoadFailed,
    primarySubtitleUrl,
    resolvedShareToken,
    subtitleSelectionKey,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    return setupSubtitleTrackSync(video, activeSubtitleUrl);
  }, [activeSubtitleUrl]);

  const handleSubtitleTrackError = useCallback(() => {
    if (!primarySubtitleUrl) {
      return;
    }

    if (activeSubtitleUrl !== primarySubtitleUrl) {
      return;
    }

    setFailedPrimarySubtitleKey(subtitleSelectionKey);
  }, [activeSubtitleUrl, primarySubtitleUrl, subtitleSelectionKey]);

  function handleVideoSeeking() {
    const activeStatusSnapshot = statusRef.current;
    const activeStatus = activeStatusSnapshot?.status;
    if (!activeStatusSnapshot || !activeStatus?.isLive) {
      return;
    }

    if (Date.now() < suppressSeekGuardUntilRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const targetPosition = resolveBroadcastTargetPosition(
      activeStatus,
      activeStatusSnapshot.receivedAtMs,
    );
    if (Math.abs(video.currentTime - targetPosition) > 0.75) {
      suppressSeekGuardUntilRef.current = Date.now() + SEEK_GUARD_WINDOW_MS;
      video.currentTime = targetPosition;
    }
  }

  const handleStartPlaybackClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setShowStartPlaybackButton(false);

    const activeHls = hlsRef.current;
    if (activeHls) {
      try {
        activeHls.startLoad();
      } catch {
        // Ignore and rely on direct play attempt.
      }
    }

    void video.play()
      .then(() => {
        setError(null);
        runPlaybackSyncRef.current();
      })
      .catch(() => {
        setShowStartPlaybackButton(true);
      });
  }, []);

  if (!resolvedShareToken) {
    return (
      <main className="broadcast-public-page">
        <section className="broadcast-public-shell">
          <p className="error-text">Broadcast token is missing.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="broadcast-public-page">
      <section className="broadcast-public-shell">
        <header className="broadcast-public-header">
          <p className="eyebrow">YEEN Broadcast</p>
          <h1>Anonymous Stream</h1>
          <p className="broadcast-public-viewers">{viewerLabel}</p>
        </header>

        {loading ? (
          <p className="muted">Loading broadcast...</p>
        ) : null}

        {error ? (
          <p className="error-text broadcast-public-error">{error}</p>
        ) : null}

        {!loading && !status?.enabled ? (
          <section className="broadcast-offline-card" aria-live="polite">
            <h2>Broadcast is offline</h2>
            <p>The broadcaster has not enabled broadcast mode yet.</p>
          </section>
        ) : null}

        {isStandbyState ? (
          <section className="broadcast-standby" aria-live="polite">
            <div className="broadcast-standby-bars" aria-hidden="true" />
            <div className="broadcast-standby-loader">
              <span className="broadcast-standby-spinner" aria-hidden="true" />
              <p>Waiting for the broadcaster to start playback...</p>
            </div>
          </section>
        ) : null}

        {isLiveState ? (
          <section className="broadcast-live-player" aria-live="polite">
            <video
              ref={videoRef}
              className="broadcast-public-video"
              style={subtitleVideoStyle}
              autoPlay
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              controls
              controlsList="nodownload noplaybackrate"
              tabIndex={-1}
              onSeeking={handleVideoSeeking}
            >
              {activeSubtitleUrl ? (
                <track
                  key={activeSubtitleUrl}
                  kind="subtitles"
                  src={activeSubtitleUrl}
                  srcLang="en"
                  label="Subtitles"
                  default
                  onError={handleSubtitleTrackError}
                />
              ) : null}
            </video>

            {showStartPlaybackButton ? (
              <button
                type="button"
                className="broadcast-start-playback-button"
                onClick={handleStartPlaybackClick}
                aria-label="Start stream playback"
              >
                <span className="broadcast-start-playback-icon" aria-hidden="true" />
              </button>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
