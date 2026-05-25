import { describe, expect, it } from 'vitest';
import type { BroadcastPublicSession } from '../../shared/services/types';
import {
  resolvePublicBroadcastSyncState,
  resolveSourceEpochTransition,
  shouldRunStallRecovery,
} from './publicBroadcastSyncState';

function createStatus(
  overrides: Partial<BroadcastPublicSession> = {},
): BroadcastPublicSession {
  return {
    enabled: true,
    isLive: true,
    activePlayer: true,
    shareToken: 'share-token',
    mediaId: 'media-1',
    sourceEpoch: 1,
    streamKey: 'media-1:hls-1',
    manifestUrl: '/api/broadcast/public/share-token/hls/1/master.m3u8?stream=media-1%3Ahls-1',
    subtitleUrl: '/api/broadcast/public/share-token/subtitles/sub.vtt?sourceEpoch=1&stream=media-1%3Ahls-1',
    subtitleFontPreset: 'condensed',
    playbackPositionSeconds: 10,
    playbackIsPlaying: true,
    playbackUpdatedAt: new Date(1000).toISOString(),
    playbackUpdatedAtMs: 1000,
    serverNowMs: 1100,
    segmentTracking: null,
    viewerCount: 1,
    ...overrides,
  };
}

describe('publicBroadcastSyncState', () => {
  it('resolves offline and standby states deterministically', () => {
    expect(
      resolvePublicBroadcastSyncState(createStatus({ enabled: false })),
    ).toBe('offline');
    expect(
      resolvePublicBroadcastSyncState(
        createStatus({ enabled: true, isLive: false, manifestUrl: null }),
      ),
    ).toBe('standby');
  });

  it('returns live_syncing when status is live with manifest', () => {
    expect(resolvePublicBroadcastSyncState(createStatus())).toBe('live_syncing');
  });

  it('tracks sourceEpoch and requests manifest reset only on real transition', () => {
    const baseline = createStatus({ sourceEpoch: 3 });

    expect(resolveSourceEpochTransition(null, baseline)).toEqual({
      nextSourceEpoch: 3,
      shouldResetManifest: false,
    });

    expect(resolveSourceEpochTransition(3, baseline)).toEqual({
      nextSourceEpoch: 3,
      shouldResetManifest: false,
    });

    expect(
      resolveSourceEpochTransition(3, createStatus({ sourceEpoch: 4 })),
    ).toEqual({
      nextSourceEpoch: 4,
      shouldResetManifest: true,
    });
  });

  it('clears tracked sourceEpoch when status is not live', () => {
    expect(
      resolveSourceEpochTransition(
        7,
        createStatus({ enabled: true, isLive: false, manifestUrl: null }),
      ),
    ).toEqual({
      nextSourceEpoch: null,
      shouldResetManifest: false,
    });
  });

  it('enforces stall recovery cooldown', () => {
    expect(shouldRunStallRecovery(1000, 2000, 1500)).toBe(false);
    expect(shouldRunStallRecovery(1000, 2600, 1500)).toBe(true);
  });
});
