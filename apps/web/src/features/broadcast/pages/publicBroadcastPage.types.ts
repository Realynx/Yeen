import type Hls from 'hls.js';
import type { RefObject } from 'react';
import type {
  BroadcastStatusSnapshot,
  PlaybackSyncRuntime,
} from '../services/publicBroadcastPlaybackSync';
import type { PublicBroadcastSyncState } from '../services/publicBroadcastSyncState';

export interface PublicBroadcastPageHlsRecoveryState {
  attemptedNetworkRecovery: boolean;
  restartedSession: boolean;
  lastNetworkRecoveryAtMs: number;
  segment503WindowStartedAtMs: number;
  segment503Count: number;
}

export interface PublicBroadcastPageWatchdogState {
  lastObservedCurrentTime: number;
  lastObservedAtMs: number;
  lastPlaybackProgressAtMs: number;
  lastFragmentLoadedAtMs: number;
  consecutiveWeakProgressSamples: number;
  recoveryStage: number;
}

export interface PublicBroadcastPageControllerRefs {
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<Hls | null>;
  manifestUrlRef: RefObject<string | null>;
  statusRef: RefObject<BroadcastStatusSnapshot | null>;
  syncStateRef: RefObject<PublicBroadcastSyncState>;
  activeSourceEpochRef: RefObject<number | null>;
  runPlaybackSyncRef: RefObject<() => void>;
  suppressSeekGuardUntilRef: RefObject<number>;
  lastStallRecoveryAtRef: RefObject<number>;
  playbackWatchdogRef: RefObject<PublicBroadcastPageWatchdogState>;
  hlsRecoveryStateRef: RefObject<PublicBroadcastPageHlsRecoveryState>;
  syncRuntimeRef: RefObject<PlaybackSyncRuntime>;
}
