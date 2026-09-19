import type { BroadcastPublicSession } from '../../shared/services/types';

export type PublicBroadcastSyncState =
  | 'offline'
  | 'standby'
  | 'live_syncing'
  | 'recover_manifest'
  | 'recover_stall';

export interface SourceEpochTransition {
  nextSourceEpoch: number | null;
  shouldResetManifest: boolean;
}

export function resolvePublicBroadcastSyncState(
  status: BroadcastPublicSession | null,
): PublicBroadcastSyncState {
  if (!status?.enabled) {
    return 'offline';
  }

  if (!status.isLive || !status.manifestUrl) {
    return 'standby';
  }

  return 'live_syncing';
}

export function resolveSourceEpochTransition(
  previousSourceEpoch: number | null,
  status: BroadcastPublicSession | null,
): SourceEpochTransition {
  if (!status?.enabled) {
    return {
      nextSourceEpoch: null,
      shouldResetManifest: previousSourceEpoch !== null,
    };
  }

  const normalizedSourceEpoch = normalizeSourceEpoch(status.sourceEpoch);
  if (previousSourceEpoch === null) {
    return {
      nextSourceEpoch: normalizedSourceEpoch,
      shouldResetManifest: false,
    };
  }

  return {
    nextSourceEpoch: normalizedSourceEpoch,
    shouldResetManifest: previousSourceEpoch !== normalizedSourceEpoch,
  };
}

export function shouldRunStallRecovery(
  lastRecoveryAtMs: number,
  nowMs: number,
  cooldownMs: number,
): boolean {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    return true;
  }

  return nowMs - lastRecoveryAtMs >= cooldownMs;
}

function normalizeSourceEpoch(sourceEpoch: number): number {
  if (!Number.isFinite(sourceEpoch) || sourceEpoch < 0) {
    return 0;
  }

  return Math.floor(sourceEpoch);
}
