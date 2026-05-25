import {
  absoluteApiUrl,
} from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';

const HARD_SYNC_DRIFT_SECONDS = 1.1;
const EXTREME_SYNC_DRIFT_SECONDS = 4.5;
const SOFT_SYNC_DRIFT_SECONDS = 0.28;
const SOFT_SYNC_RATE_LIMIT = 0.03;
const LIVE_STATE_GRACE_MS = 8000;
const MAX_PREDICTED_LEAD_SECONDS = 1.5;
const HARD_SYNC_COOLDOWN_MS = 2800;
const MANIFEST_SETTLE_MS = 2200;

export const SEEK_GUARD_WINDOW_MS = 1200;

export interface PlaybackSyncRuntime {
  lastManifestUrl: string | null;
  lastManifestAppliedAtMs: number;
  lastHardSyncAtMs: number;
}

export function resolveBroadcastTargetPosition(status: BroadcastPublicSession): number {
  const basePosition = Math.max(0, status.playbackPositionSeconds);

  if (!status.playbackIsPlaying) {
    return basePosition;
  }

  const playbackUpdatedAtMs = Date.parse(status.playbackUpdatedAt ?? '');
  if (!Number.isFinite(playbackUpdatedAtMs)) {
    return basePosition;
  }

  const elapsedSeconds = Math.max(0, (Date.now() - playbackUpdatedAtMs) / 1000);
  return basePosition + Math.min(elapsedSeconds, MAX_PREDICTED_LEAD_SECONDS);
}

export function resolveEffectiveBroadcastStatus(
  status: BroadcastPublicSession | null,
  lastLiveStatus: BroadcastPublicSession | null,
  lastLiveAtMs: number,
): BroadcastPublicSession | null {
  if (status?.isLive && status.manifestUrl) {
    return status;
  }

  if (!lastLiveStatus) {
    return status;
  }

  const withinGraceWindow = Date.now() - lastLiveAtMs <= LIVE_STATE_GRACE_MS;
  if (!withinGraceWindow) {
    return status;
  }

  if (status?.enabled === false) {
    return status;
  }

  if (
    status?.mediaId
    && lastLiveStatus.mediaId
    && status.mediaId !== lastLiveStatus.mediaId
  ) {
    return status;
  }

  if (!status) {
    return lastLiveStatus;
  }

  return {
    ...lastLiveStatus,
    enabled: status.enabled,
    viewerCount: status.viewerCount,
    shareToken: status.shareToken,
    mediaId: status.mediaId ?? lastLiveStatus.mediaId,
    subtitleUrl: status.subtitleUrl ?? lastLiveStatus.subtitleUrl,
  };
}

export function syncVideoToBroadcastStatus(
  video: HTMLVideoElement,
  status: BroadcastPublicSession,
  syncRuntimeRef: { current: PlaybackSyncRuntime },
  suppressSeekGuardUntilRef: { current: number },
): void {
  const nowMs = Date.now();

  if (!status.isLive || !status.manifestUrl) {
    if (!video.paused) {
      video.pause();
    }

    if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }

    return;
  }

  const nextManifestUrl = absoluteApiUrl(status.manifestUrl);
  if (video.src !== nextManifestUrl) {
    video.src = nextManifestUrl;
    video.load();
    syncRuntimeRef.current.lastManifestUrl = nextManifestUrl;
    syncRuntimeRef.current.lastManifestAppliedAtMs = nowMs;
    syncRuntimeRef.current.lastHardSyncAtMs = 0;
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    return;
  }

  if (video.readyState < 1) {
    return;
  }

  if (video.seeking && nowMs < suppressSeekGuardUntilRef.current) {
    return;
  }

  const targetPosition = resolveBroadcastTargetPosition(status);
  const currentPosition = Number.isFinite(video.currentTime)
    ? video.currentTime
    : 0;
  const drift = targetPosition - currentPosition;
  const absoluteDrift = Math.abs(drift);

  const inManifestSettleWindow =
    nowMs - syncRuntimeRef.current.lastManifestAppliedAtMs < MANIFEST_SETTLE_MS;

  const canHardSync =
    absoluteDrift > EXTREME_SYNC_DRIFT_SECONDS
    || nowMs - syncRuntimeRef.current.lastHardSyncAtMs >= HARD_SYNC_COOLDOWN_MS;

  if (!inManifestSettleWindow && absoluteDrift > HARD_SYNC_DRIFT_SECONDS && canHardSync) {
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    syncRuntimeRef.current.lastHardSyncAtMs = nowMs;
    video.currentTime = targetPosition;
    video.playbackRate = 1;
  } else if (
    status.playbackIsPlaying
    && absoluteDrift > SOFT_SYNC_DRIFT_SECONDS
    && !inManifestSettleWindow
  ) {
    const adjustment = Math.max(
      -SOFT_SYNC_RATE_LIMIT,
      Math.min(SOFT_SYNC_RATE_LIMIT, drift * 0.08),
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
