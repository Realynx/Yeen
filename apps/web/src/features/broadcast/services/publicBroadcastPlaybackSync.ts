import {
  absoluteApiUrl,
} from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';

const HARD_SYNC_DRIFT_SECONDS = 1.25;
const EXTREME_SYNC_DRIFT_SECONDS = 4;
const SOFT_SYNC_DRIFT_SECONDS = 0.15;
const SOFT_SYNC_HYSTERESIS_SECONDS = 0.04;
const SOFT_SYNC_RATE_LIMIT = 0.08;
const MAX_PREDICTED_LEAD_SECONDS = 1.2;
const SEGMENT_READY_SAFETY_SECONDS = 0.35;
const HARD_SYNC_COOLDOWN_MS = 2000;
const MANIFEST_SETTLE_MS = 500;
const DRIFT_SMOOTHING_ALPHA = 0.35;

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

function pauseInactiveBroadcast(video: HTMLVideoElement, runtime: PlaybackSyncRuntime): void {
  if (!video.paused) video.pause();
  if (video.playbackRate !== 1) video.playbackRate = 1;
  runtime.smoothedDriftSeconds = 0;
}

function applyBroadcastManifest(
  video: HTMLVideoElement,
  url: string,
  nowMs: number,
  runtime: PlaybackSyncRuntime,
  seekGuard: { current: number },
  controller?: PlaybackManifestSyncController,
): void {
  if (controller) controller.applyManifest(url);
  else { video.src = url; video.load(); }
  runtime.lastManifestUrl = url;
  runtime.lastManifestAppliedAtMs = nowMs;
  runtime.lastHardSyncAtMs = 0;
  runtime.smoothedDriftSeconds = 0;
  seekGuard.current = nowMs + SEEK_GUARD_WINDOW_MS;
}

function applyPlaybackDrift(
  video: HTMLVideoElement,
  status: BroadcastPublicSession,
  target: number,
  drift: number,
  smoothedDrift: number,
  nowMs: number,
  runtime: PlaybackSyncRuntime,
  seekGuard: { current: number },
): void {
  const settling = nowMs - runtime.lastManifestAppliedAtMs < MANIFEST_SETTLE_MS;
  const canHardSync = Math.abs(drift) > EXTREME_SYNC_DRIFT_SECONDS
    || nowMs - runtime.lastHardSyncAtMs >= HARD_SYNC_COOLDOWN_MS;
  if (!settling && Math.abs(drift) > HARD_SYNC_DRIFT_SECONDS && canHardSync) {
    seekGuard.current = nowMs + SEEK_GUARD_WINDOW_MS;
    runtime.lastHardSyncAtMs = nowMs;
    runtime.smoothedDriftSeconds = 0;
    video.currentTime = target;
    video.playbackRate = 1;
  } else if (status.playbackIsPlaying
      && Math.abs(smoothedDrift) > resolveSoftSyncThreshold(video.playbackRate) && !settling) {
    const adjustment = Math.max(-SOFT_SYNC_RATE_LIMIT, Math.min(SOFT_SYNC_RATE_LIMIT, smoothedDrift * 0.08));
    video.playbackRate = 1 + adjustment;
  } else if (video.playbackRate !== 1) video.playbackRate = 1;
}

async function resumeBroadcastPlayback(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
    return;
  } catch {
    // Chromium can revoke audible autoplay after the broadcaster pauses. A
    // muted retry keeps the shared timeline moving; native controls let the
    // viewer opt back into audio without another playback restart.
  }

  video.muted = true;
  try {
    await video.play();
  } catch {
    // Native controls remain available when the browser requires a gesture.
  }
}

function syncPlayingState(video: HTMLVideoElement, playing: boolean): void {
  if (playing && video.paused) {
    void resumeBroadcastPlayback(video);
  } else if (!playing && !video.paused) video.pause();
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
    pauseInactiveBroadcast(video, syncRuntimeRef.current);
    return;
  }

  const nextManifestUrl = absoluteApiUrl(status.manifestUrl);
  const activeManifestUrl = manifestSyncController
    ? manifestSyncController.currentManifestUrl
    : video.src;

  if (activeManifestUrl !== nextManifestUrl) {
    applyBroadcastManifest(video, nextManifestUrl, nowMs, syncRuntimeRef.current,
      suppressSeekGuardUntilRef, manifestSyncController);
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
  const targetPosition = resolveBroadcastTargetPosition(status, statusReceivedAtMs);

  const drift = targetPosition - currentPosition;
  const smoothedDrift = resolveSmoothedDrift(
    syncRuntimeRef.current.smoothedDriftSeconds,
    drift,
  );
  syncRuntimeRef.current.smoothedDriftSeconds = smoothedDrift;

  applyPlaybackDrift(video, status, targetPosition, drift, smoothedDrift, nowMs,
    syncRuntimeRef.current, suppressSeekGuardUntilRef);
  syncPlayingState(video, status.playbackIsPlaying);
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
