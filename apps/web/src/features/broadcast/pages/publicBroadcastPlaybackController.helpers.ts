import Hls, { type ErrorData } from 'hls.js';
import {
  MAX_SEGMENT_503S_PER_WINDOW,
  SEGMENT_503_WINDOW_MS,
} from './publicBroadcastPage.constants';
import type {
  PublicBroadcastPageHlsRecoveryState,
  PublicBroadcastPageWatchdogState,
} from './publicBroadcastPage.types';

export function createDefaultWatchdogState(): PublicBroadcastPageWatchdogState {
  return {
    lastObservedCurrentTime: 0,
    lastObservedAtMs: 0,
    lastPlaybackProgressAtMs: 0,
    lastFragmentLoadedAtMs: 0,
    consecutiveWeakProgressSamples: 0,
    recoveryStage: 0,
  };
}

export function createDefaultHlsRecoveryState(): PublicBroadcastPageHlsRecoveryState {
  return {
    attemptedNetworkRecovery: false,
    restartedSession: false,
    lastNetworkRecoveryAtMs: 0,
    segment503WindowStartedAtMs: 0,
    segment503Count: 0,
  };
}

export function shouldRestartForPersistentSegment503(
  data: ErrorData,
  recovery: PublicBroadcastPageHlsRecoveryState,
): boolean {
  if (data.type !== Hls.ErrorTypes.NETWORK_ERROR) {
    return false;
  }

  if (!isSegmentError(data)) {
    return false;
  }

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

export function getErrorResponseStatus(data: ErrorData): number | null {
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
