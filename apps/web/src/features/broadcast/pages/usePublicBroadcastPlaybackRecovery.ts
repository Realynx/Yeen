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
import {
  resumePublicBroadcastHlsLoading,
  resumePublicBroadcastNativePlayback,
} from '../services/publicBroadcastHlsRecovery';

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

type WatchdogObservation = 'initialized' | 'progressed' | 'weak';

function observePlayback(
  watchdog: PublicBroadcastPageWatchdogState,
  currentTime: number,
  nowMs: number,
): WatchdogObservation {
  if (watchdog.lastObservedAtMs === 0) {
    watchdog.lastObservedCurrentTime = currentTime;
    watchdog.lastObservedAtMs = nowMs;
    watchdog.lastPlaybackProgressAtMs = nowMs;
    if (watchdog.lastFragmentLoadedAtMs === 0) watchdog.lastFragmentLoadedAtMs = nowMs;
    return 'initialized';
  }
  const elapsedMs = Math.max(1, nowMs - watchdog.lastObservedAtMs);
  const minimumProgress = Math.max(
    PLAYBACK_PROGRESS_DELTA_SECONDS,
    (elapsedMs / 1000) * MIN_EXPECTED_PROGRESS_FACTOR,
  );
  const progressed = currentTime - watchdog.lastObservedCurrentTime >= minimumProgress;
  watchdog.lastObservedCurrentTime = currentTime;
  watchdog.lastObservedAtMs = nowMs;
  if (progressed) {
    watchdog.lastPlaybackProgressAtMs = nowMs;
    watchdog.consecutiveWeakProgressSamples = 0;
    watchdog.recoveryStage = 0;
    return 'progressed';
  }
  watchdog.consecutiveWeakProgressSamples += 1;
  return 'weak';
}

function playbackStalled(
  watchdog: PublicBroadcastPageWatchdogState,
  nowMs: number,
  bufferedAhead: number,
): boolean {
  const hardStall = nowMs - watchdog.lastPlaybackProgressAtMs >= PLAYBACK_STALL_WINDOW_MS;
  const fragmentStall = nowMs - watchdog.lastFragmentLoadedAtMs >= FRAGMENT_STALL_WINDOW_MS;
  const nearStall = watchdog.consecutiveWeakProgressSamples >= WEAK_PROGRESS_SAMPLE_THRESHOLD
    && fragmentStall && bufferedAhead <= LOW_BUFFER_AHEAD_SECONDS;
  return hardStall || nearStall;
}

function runLoaderRecovery(
  watchdog: PublicBroadcastPageWatchdogState,
  video: HTMLVideoElement,
  activeHls: Hls | null,
  setError: (value: string) => void,
  runSync: () => void,
): boolean {
  if (watchdog.recoveryStage !== 0) return false;
  watchdog.recoveryStage = 1;
  watchdog.consecutiveWeakProgressSamples = 0;
  setError('Playback appears stalled. Retrying stream loader...');
  if (video.paused) void video.play().catch(() => { /* Continue with loader nudges. */ });
  if (activeHls) {
    try { activeHls.startLoad(); } catch { /* Escalate on the next cycle. */ }
  }
  runSync();
  return true;
}

function runSessionRecovery(
  watchdog: PublicBroadcastPageWatchdogState,
  video: HTMLVideoElement,
  activeHls: Hls | null,
  manifestUrl: string | null,
  nowMs: number,
  options: Pick<UsePublicBroadcastPlaybackRecoveryOptions,
    'setError' | 'resetPlaybackWatchdog' | 'playbackWatchdogRef' | 'lastStallRecoveryAtRef' | 'runPlaybackSyncRef'>,
): boolean {
  if (watchdog.recoveryStage < 1 || !manifestUrl) return false;
  watchdog.recoveryStage = 2;
  watchdog.consecutiveWeakProgressSamples = 0;
  try {
    options.setError('Playback still stalled. Restarting stream loader...');
    if (activeHls) {
      resumePublicBroadcastHlsLoading(video, activeHls);
    } else {
      resumePublicBroadcastNativePlayback(video, () => undefined);
    }
    options.resetPlaybackWatchdog();
    const reset = options.playbackWatchdogRef.current;
    reset.recoveryStage = 2;
    reset.lastObservedAtMs = nowMs;
    reset.lastPlaybackProgressAtMs = nowMs;
    reset.lastFragmentLoadedAtMs = nowMs;
    options.lastStallRecoveryAtRef.current = nowMs + Math.max(
      0, WATCHDOG_SESSION_RELOAD_SETTLE_MS - WATCHDOG_RECOVERY_COOLDOWN_MS,
    );
    options.runPlaybackSyncRef.current();
    return true;
  } catch {
    return false;
  }
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
      } else {
        resumePublicBroadcastNativePlayback(video, runPlaybackSyncRef.current);
      }
    };

    video.addEventListener('waiting', handlePlaybackStall);
    video.addEventListener('stalled', handlePlaybackStall);

    return () => {
      video.removeEventListener('waiting', handlePlaybackStall);
      video.removeEventListener('stalled', handlePlaybackStall);
    };
  }, [hlsRef, lastStallRecoveryAtRef, runPlaybackSyncRef, status?.enabled, status?.isLive, status?.manifestUrl, statusRef, videoRef]);

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

      if (observePlayback(watchdog, currentTime, nowMs) !== 'weak') return;

      if (video.seeking || nowMs < suppressSeekGuardUntilRef.current) {
        return;
      }

      if (!playbackStalled(watchdog, nowMs, resolveBufferedAheadSeconds(video, currentTime))) return;

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
      if (runLoaderRecovery(watchdog, video, activeHls, setError, runPlaybackSyncRef.current)) return;
      if (runSessionRecovery(watchdog, video, activeHls, manifestUrlRef.current, nowMs, {
        setError, resetPlaybackWatchdog, playbackWatchdogRef,
        lastStallRecoveryAtRef, runPlaybackSyncRef,
      })) return;

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
