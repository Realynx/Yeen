import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Hls, { type ErrorData } from 'hls.js';
import { createHlsInstance } from '../../player/services/hls/createHls';
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
} from '../services/publicBroadcastSyncState';
import {
  NETWORK_RECOVERY_RESET_WINDOW_MS,
} from './publicBroadcastPage.constants';
import {
  createDefaultHlsRecoveryState,
  createDefaultWatchdogState,
  getErrorResponseStatus,
  shouldRestartForPersistentSegment503,
} from './publicBroadcastPlaybackController.helpers';

interface UsePublicBroadcastPlaybackControllerOptions {
  statusSnapshot: BroadcastStatusSnapshot | null;
  setError: Dispatch<SetStateAction<string | null>>;
}

export function usePublicBroadcastPlaybackController({
  statusSnapshot,
  setError,
}: UsePublicBroadcastPlaybackControllerOptions) {
  const status = statusSnapshot?.status ?? null;

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
  const playbackWatchdogRef = useRef(createDefaultWatchdogState());
  const hlsRecoveryStateRef = useRef(createDefaultHlsRecoveryState());
  const syncRuntimeRef = useRef<PlaybackSyncRuntime>({
    lastManifestUrl: null,
    lastManifestAppliedAtMs: 0,
    lastHardSyncAtMs: 0,
    smoothedDriftSeconds: 0,
  });

  const resetHlsRecoveryState = useCallback(() => {
    hlsRecoveryStateRef.current = createDefaultHlsRecoveryState();
  }, []);

  const resetPlaybackWatchdog = useCallback(() => {
    playbackWatchdogRef.current = createDefaultWatchdogState();
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
        && shouldRestartForPersistentSegment503(data, hlsRecoveryStateRef.current)
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
  }, [destroyHlsInstance, resetHlsRecoveryState, resetPlaybackWatchdog, setError]);

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
  }, [attachHlsRecovery, destroyHlsInstance, resetHlsRecoveryState, resetPlaybackWatchdog]);

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

  const handleVideoSeeking = useCallback(() => {
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
  }, []);

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

  return {
    videoRef,
    hlsRef,
    manifestUrlRef,
    statusRef,
    syncStateRef,
    runPlaybackSyncRef,
    suppressSeekGuardUntilRef,
    lastStallRecoveryAtRef,
    playbackWatchdogRef,
    resetPlaybackWatchdog,
    destroyHlsInstance,
    handleVideoSeeking,
  };
}
