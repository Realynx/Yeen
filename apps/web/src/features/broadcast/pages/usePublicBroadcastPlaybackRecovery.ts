import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type Hls from 'hls.js';
import type { BroadcastStatusSnapshot } from '../services/publicBroadcastPlaybackSync';
import {
  type PublicBroadcastSyncState,
  shouldRunStallRecovery,
} from '../services/publicBroadcastSyncState';
import {
  FRAGMENT_STALL_WINDOW_MS,
  LOW_BUFFER_AHEAD_SECONDS,
  MIN_EXPECTED_PROGRESS_FACTOR,
  PLAYBACK_PROGRESS_DELTA_SECONDS,
  PLAYBACK_STALL_WINDOW_MS,
  PLAYBACK_WATCHDOG_INTERVAL_MS,
  STALL_RECOVERY_COOLDOWN_MS,
  WATCHDOG_RECOVERY_COOLDOWN_MS,
  WATCHDOG_SESSION_RELOAD_SETTLE_MS,
  WEAK_PROGRESS_SAMPLE_THRESHOLD,
} from './publicBroadcastPage.constants';
import type {
  PublicBroadcastPageWatchdogState,
} from './publicBroadcastPage.types';

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

interface UsePublicBroadcastPlaybackRecoveryOptions {
  status: BroadcastStatusSnapshot['status'] | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<Hls | null>;
  manifestUrlRef: RefObject<string | null>;
  statusRef: RefObject<BroadcastStatusSnapshot | null>;
  syncStateRef: RefObject<PublicBroadcastSyncState>;
  runPlaybackSyncRef: RefObject<() => void>;
  suppressSeekGuardUntilRef: RefObject<number>;
  lastStallRecoveryAtRef: RefObject<number>;
  playbackWatchdogRef: RefObject<PublicBroadcastPageWatchdogState>;
  setError: Dispatch<SetStateAction<string | null>>;
  resetPlaybackWatchdog: () => void;
  destroyHlsInstance: () => void;
}

export function usePublicBroadcastPlaybackRecovery({
  status,
  videoRef,
  hlsRef,
  manifestUrlRef,
  statusRef,
  syncStateRef,
  runPlaybackSyncRef,
  suppressSeekGuardUntilRef,
  lastStallRecoveryAtRef,
  playbackWatchdogRef,
  setError,
  resetPlaybackWatchdog,
  destroyHlsInstance,
}: UsePublicBroadcastPlaybackRecoveryOptions) {
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
  }, [hlsRef, lastStallRecoveryAtRef, status?.enabled, status?.isLive, status?.manifestUrl, statusRef, videoRef]);

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
    hlsRef,
    lastStallRecoveryAtRef,
    manifestUrlRef,
    playbackWatchdogRef,
    resetPlaybackWatchdog,
    runPlaybackSyncRef,
    setError,
    status?.enabled,
    status?.isLive,
    status?.manifestUrl,
    statusRef,
    suppressSeekGuardUntilRef,
    syncStateRef,
    videoRef,
  ]);
}
