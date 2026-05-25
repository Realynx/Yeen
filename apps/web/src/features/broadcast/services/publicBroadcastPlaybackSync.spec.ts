import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BroadcastPublicSession } from '../../shared/services/types';
import {
  resolveBroadcastTargetPosition,
  syncVideoToBroadcastStatus,
  type PlaybackSyncRuntime,
} from './publicBroadcastPlaybackSync';

interface MockVideo {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  readyState: number;
  seeking: boolean;
  src: string;
  load: () => void;
  play: () => Promise<void>;
  pause: () => void;
}

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
    subtitleUrl: null,
    subtitleFontPreset: 'condensed',
    playbackPositionSeconds: 10,
    playbackIsPlaying: false,
    playbackUpdatedAt: new Date(1000).toISOString(),
    playbackUpdatedAtMs: 1000,
    serverNowMs: 1000,
    segmentTracking: null,
    viewerCount: 1,
    ...overrides,
  };
}

function createVideo(
  overrides: Partial<MockVideo> = {},
): HTMLVideoElement {
  const mock: MockVideo = {
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    readyState: 4,
    seeking: false,
    src: 'http://localhost:4000/api/broadcast/public/share-token/hls/1/master.m3u8?stream=media-1%3Ahls-1',
    load: () => {},
    play: async () => {},
    pause: () => {},
    ...overrides,
  };

  return mock as unknown as HTMLVideoElement;
}

describe('publicBroadcastPlaybackSync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caps predicted lead by ready-through segment tracking', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const target = resolveBroadcastTargetPosition(
      createStatus({
        playbackPositionSeconds: 100,
        playbackIsPlaying: true,
        playbackUpdatedAt: new Date(9_000).toISOString(),
        playbackUpdatedAtMs: 9_000,
        serverNowMs: 10_000,
        segmentTracking: {
          segmentSeconds: 6,
          playbackSegmentIndex: 16,
          readySegmentIndex: 16,
          readyThroughSeconds: 100.4,
          contiguousReadySegments: 17,
          highestReadySegment: 16,
          nextSegmentIndex: 17,
        },
      }),
      10_000,
    );

    expect(target).toBeCloseTo(100.05, 4);
  });

  it('suppresses hard-sync seeks during manifest settle window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const video = createVideo({ currentTime: 0 });
    const status = createStatus({ playbackPositionSeconds: 10, playbackIsPlaying: false });
    const runtime: { current: PlaybackSyncRuntime } = {
      current: {
        lastManifestUrl: video.src,
        lastManifestAppliedAtMs: 9_700,
        lastHardSyncAtMs: 0,
        smoothedDriftSeconds: 0,
      },
    };
    const suppressSeekGuardUntilRef = { current: 0 };

    syncVideoToBroadcastStatus(
      video,
      status,
      10_000,
      runtime,
      suppressSeekGuardUntilRef,
      {
        currentManifestUrl: video.src,
        applyManifest: () => {},
      },
    );

    expect(video.currentTime).toBe(0);
    expect(runtime.current.lastHardSyncAtMs).toBe(0);
  });

  it('applies hard sync after settle window when drift exceeds threshold', () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000);

    const video = createVideo({ currentTime: 0 });
    const status = createStatus({ playbackPositionSeconds: 10, playbackIsPlaying: false });
    const runtime: { current: PlaybackSyncRuntime } = {
      current: {
        lastManifestUrl: video.src,
        lastManifestAppliedAtMs: 15_000,
        lastHardSyncAtMs: 10_000,
        smoothedDriftSeconds: 0,
      },
    };
    const suppressSeekGuardUntilRef = { current: 0 };

    syncVideoToBroadcastStatus(
      video,
      status,
      20_000,
      runtime,
      suppressSeekGuardUntilRef,
      {
        currentManifestUrl: video.src,
        applyManifest: () => {},
      },
    );

    expect(video.currentTime).toBe(10);
    expect(runtime.current.lastHardSyncAtMs).toBe(20_000);
    expect(suppressSeekGuardUntilRef.current).toBe(21_200);
  });

  it('does not start soft-sync for borderline drift while playbackRate is neutral', () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000);

    const video = createVideo({ currentTime: 9.45 });
    const status = createStatus({
      playbackPositionSeconds: 10,
      playbackIsPlaying: true,
      playbackUpdatedAt: new Date(20_000).toISOString(),
      playbackUpdatedAtMs: 20_000,
      serverNowMs: 20_000,
    });
    const runtime: { current: PlaybackSyncRuntime } = {
      current: {
        lastManifestUrl: video.src,
        lastManifestAppliedAtMs: 10_000,
        lastHardSyncAtMs: 0,
        smoothedDriftSeconds: 0,
      },
    };
    const suppressSeekGuardUntilRef = { current: 0 };

    syncVideoToBroadcastStatus(
      video,
      status,
      20_000,
      runtime,
      suppressSeekGuardUntilRef,
      {
        currentManifestUrl: video.src,
        applyManifest: () => {},
      },
    );

    expect(video.playbackRate).toBe(1);
    expect(runtime.current.smoothedDriftSeconds).toBeCloseTo(0.55, 3);
  });

  it('caps target lead shortly after a hard sync to avoid immediate re-jumps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000);

    const video = createVideo({ currentTime: 95 });
    const status = createStatus({
      playbackPositionSeconds: 100,
      playbackIsPlaying: true,
      playbackUpdatedAt: new Date(20_000).toISOString(),
      playbackUpdatedAtMs: 20_000,
      serverNowMs: 20_000,
    });
    const runtime: { current: PlaybackSyncRuntime } = {
      current: {
        lastManifestUrl: video.src,
        lastManifestAppliedAtMs: 10_000,
        lastHardSyncAtMs: 19_200,
        smoothedDriftSeconds: 0,
      },
    };
    const suppressSeekGuardUntilRef = { current: 0 };

    syncVideoToBroadcastStatus(
      video,
      status,
      20_000,
      runtime,
      suppressSeekGuardUntilRef,
      {
        currentManifestUrl: video.src,
        applyManifest: () => {},
      },
    );

    expect(video.currentTime).toBe(95);
    expect(runtime.current.lastHardSyncAtMs).toBe(19_200);
    expect(runtime.current.smoothedDriftSeconds).toBeCloseTo(0.6, 3);
  });
});
