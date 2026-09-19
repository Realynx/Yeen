import type { HlsConfig } from 'hls.js';
import {
  resolveBroadcastTargetPosition,
  type BroadcastStatusSnapshot,
} from './publicBroadcastPlaybackSync';

export type PublicBroadcastHlsLoadPlan = Pick<
  HlsConfig,
  'autoStartLoad' | 'startPosition'
>;

export function resolvePublicBroadcastHlsLoadPlan(
  snapshot: BroadcastStatusSnapshot | null,
): PublicBroadcastHlsLoadPlan {
  const startPosition = snapshot
    ? resolveBroadcastTargetPosition(snapshot.status, snapshot.receivedAtMs)
    : 0;

  return {
    autoStartLoad: false,
    startPosition: Math.max(0, startPosition),
  };
}
