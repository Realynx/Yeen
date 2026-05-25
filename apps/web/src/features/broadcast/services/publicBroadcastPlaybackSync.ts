import {
  absoluteApiUrl,
} from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';

const HARD_SYNC_DRIFT_SECONDS = 2.5;
const EXTREME_SYNC_DRIFT_SECONDS = 5.5;
const SOFT_SYNC_DRIFT_SECONDS = 0.5;
const SOFT_SYNC_HYSTERESIS_SECONDS = 0.12;
const SOFT_SYNC_RATE_LIMIT = 0.04;
const MAX_PREDICTED_LEAD_SECONDS = 1.2;
const SEGMENT_READY_SAFETY_SECONDS = 0.35;
const HARD_SYNC_COOLDOWN_MS = 5000;
const MANIFEST_SETTLE_MS = 500;
const DRIFT_SMOOTHING_ALPHA = 0.35;
const RECENT_HARD_SYNC_WINDOW_MS = 2000;
const RECENT_HARD_SYNC_LEAD_CAP_SECONDS = 0.6;

export const SEEK_GUARD_WINDOW_MS = 1200;

export interface PlaybackSyncRuntime {
  lastManifestUrl: string | null;
  lastManifestAppliedAtMs: number;
  lastHardSyncAtMs: number;
  smoothedDriftSeconds: number;
}

export interface PlaybackManifestSyncController {
  currentManifestUrl: string | null;
  applyManifest: (nextManifestUrl: string) => void;
}

export interface BroadcastStatusSnapshot {
  status: BroadcastPublicSession;
  receivedAtMs: number;
}

export function resolveBroadcastTargetPosition(
  status: BroadcastPublicSession,
  statusReceivedAtMs: number,
): number {
  const basePosition = Math.max(0, status.playbackPositionSeconds);

  if (!status.playbackIsPlaying) {
    return basePosition;
  }

  const segmentReadyLeadCapSeconds = resolveSegmentReadyLeadCapSeconds(
    status,
    basePosition,
  );
  const maxPredictedLeadSeconds =
    segmentReadyLeadCapSeconds === null
      ? MAX_PREDICTED_LEAD_SECONDS
      : Math.min(MAX_PREDICTED_LEAD_SECONDS, segmentReadyLeadCapSeconds);

  const playbackUpdatedAtMsFromStatus =
    typeof status.playbackUpdatedAtMs === 'number' && Number.isFinite(status.playbackUpdatedAtMs)
      ? status.playbackUpdatedAtMs
      : null;
  const serverNowMs =
    typeof status.serverNowMs === 'number' && Number.isFinite(status.serverNowMs)
      ? status.serverNowMs
      : null;

  if (playbackUpdatedAtMsFromStatus !== null && serverNowMs !== null) {
    const serverElapsedMs = Math.max(0, serverNowMs - playbackUpdatedAtMsFromStatus);
    const clientElapsedSinceReceiveMs = Math.max(0, Date.now() - statusReceivedAtMs);
    const elapsedSeconds = (serverElapsedMs + clientElapsedSinceReceiveMs) / 1000;

    return basePosition + Math.min(elapsedSeconds, maxPredictedLeadSeconds);
  }

  const playbackUpdatedAtMs = Date.parse(status.playbackUpdatedAt ?? '');
  if (!Number.isFinite(playbackUpdatedAtMs)) {
    return basePosition;
  }

  const elapsedSeconds = Math.max(0, (Date.now() - playbackUpdatedAtMs) / 1000);
  return basePosition + Math.min(elapsedSeconds, maxPredictedLeadSeconds);
}

function resolveSegmentReadyLeadCapSeconds(
  status: BroadcastPublicSession,
  basePosition: number,
): number | null {
  const readyThroughSeconds = status.segmentTracking?.readyThroughSeconds;
  if (
    typeof readyThroughSeconds !== 'number'
    || !Number.isFinite(readyThroughSeconds)
  ) {
    return null;
  }

  return Math.max(
    0,
    readyThroughSeconds - basePosition - SEGMENT_READY_SAFETY_SECONDS,
  );
}

export function syncVideoToBroadcastStatus(
  video: HTMLVideoElement,
  status: BroadcastPublicSession,
  statusReceivedAtMs: number,
  syncRuntimeRef: { current: PlaybackSyncRuntime },
  suppressSeekGuardUntilRef: { current: number },
  manifestSyncController?: PlaybackManifestSyncController,
): void {
  const nowMs = Date.now();

  if (!status.isLive || !status.manifestUrl) {
    if (!video.paused) {
      video.pause();
    }

    if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }

    syncRuntimeRef.current.smoothedDriftSeconds = 0;

    return;
  }

  const nextManifestUrl = absoluteApiUrl(status.manifestUrl);
  const activeManifestUrl = manifestSyncController
    ? manifestSyncController.currentManifestUrl
    : video.src;

  if (activeManifestUrl !== nextManifestUrl) {
    if (manifestSyncController) {
      manifestSyncController.applyManifest(nextManifestUrl);
    } else {
      video.src = nextManifestUrl;
      video.load();
    }

    syncRuntimeRef.current.lastManifestUrl = nextManifestUrl;
    syncRuntimeRef.current.lastManifestAppliedAtMs = nowMs;
    syncRuntimeRef.current.lastHardSyncAtMs = 0;
    syncRuntimeRef.current.smoothedDriftSeconds = 0;
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    return;
  }

  if (video.readyState < 1) {
    return;
  }

  if (video.seeking && nowMs < suppressSeekGuardUntilRef.current) {
    return;
  }

  const currentPosition = Number.isFinite(video.currentTime)
    ? video.currentTime
    : 0;
  let targetPosition = resolveBroadcastTargetPosition(status, statusReceivedAtMs);

  if (
    status.playbackIsPlaying
    && nowMs - syncRuntimeRef.current.lastHardSyncAtMs <= RECENT_HARD_SYNC_WINDOW_MS
  ) {
    targetPosition = Math.min(
      targetPosition,
      currentPosition + RECENT_HARD_SYNC_LEAD_CAP_SECONDS,
    );
  }

  const drift = targetPosition - currentPosition;
  const smoothedDrift = resolveSmoothedDrift(
    syncRuntimeRef.current.smoothedDriftSeconds,
    drift,
  );
  syncRuntimeRef.current.smoothedDriftSeconds = smoothedDrift;

  const absoluteDrift = Math.abs(drift);
  const absoluteSmoothedDrift = Math.abs(smoothedDrift);

  const inManifestSettleWindow =
    nowMs - syncRuntimeRef.current.lastManifestAppliedAtMs < MANIFEST_SETTLE_MS;

  const canHardSync =
    absoluteDrift > EXTREME_SYNC_DRIFT_SECONDS
    || nowMs - syncRuntimeRef.current.lastHardSyncAtMs >= HARD_SYNC_COOLDOWN_MS;

  if (!inManifestSettleWindow && absoluteDrift > HARD_SYNC_DRIFT_SECONDS && canHardSync) {
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    syncRuntimeRef.current.lastHardSyncAtMs = nowMs;
    syncRuntimeRef.current.smoothedDriftSeconds = 0;
    video.currentTime = targetPosition;
    video.playbackRate = 1;
  } else if (
    status.playbackIsPlaying
    && absoluteSmoothedDrift > resolveSoftSyncThreshold(video.playbackRate)
    && !inManifestSettleWindow
  ) {
    const adjustment = Math.max(
      -SOFT_SYNC_RATE_LIMIT,
      Math.min(SOFT_SYNC_RATE_LIMIT, smoothedDrift * 0.08),
    );
    video.playbackRate = 1 + adjustment;
  } else if (video.playbackRate !== 1) {
    video.playbackRate = 1;
  }

  if (status.playbackIsPlaying) {
    if (video.paused) {
      void video.play().catch(() => {
        // Native controls still allow the viewer to start playback manually.
      });
    }
  } else if (!video.paused) {
    video.pause();
  }
}

function resolveSmoothedDrift(previous: number, next: number): number {
  if (!Number.isFinite(previous) || previous === 0) {
    return next;
  }

  return previous + (next - previous) * DRIFT_SMOOTHING_ALPHA;
}

function resolveSoftSyncThreshold(currentPlaybackRate: number): number {
  if (currentPlaybackRate === 1) {
    return SOFT_SYNC_DRIFT_SECONDS + SOFT_SYNC_HYSTERESIS_SECONDS;
  }

  return Math.max(
    0,
    SOFT_SYNC_DRIFT_SECONDS - SOFT_SYNC_HYSTERESIS_SECONDS,
  );
}
