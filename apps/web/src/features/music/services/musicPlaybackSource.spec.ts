import { describe, expect, it, vi } from 'vitest';
import type { HlsStartResponse, PlaybackPlan } from '../../shared/services/types';
import {
  resolveMusicHlsFallbackSource,
  resolveMusicPlaybackSource,
} from './musicPlaybackSource';

function playbackPlan(directSupported: boolean): PlaybackPlan {
  return {
    mediaId: 'track-1',
    title: 'A Track',
    directPlay: {
      supported: directSupported,
      url: '/api/stream/track-1/direct',
    },
    hls: { startUrl: '/api/stream/track-1/hls/start' },
    subtitles: { listUrl: '/api/subtitles/track-1' },
  };
}

function hlsSession(): HlsStartResponse {
  return {
    sessionId: 'session-1',
    manifestUrl: '/api/stream/hls/session-1/index.m3u8',
    totalDurationSeconds: 180,
    selectedAudioStreamIndex: 0,
    maxVideoBitrateKbps: 0,
    audioBitrateKbps: 192,
    maxOutputHeight: 0,
  };
}

describe('resolveMusicPlaybackSource', () => {
  it('preserves direct playback without starting a transcoder session', async () => {
    const startHls = vi.fn();

    const source = await resolveMusicPlaybackSource('token', 'track-1', {
      getPlan: async () => playbackPlan(true),
      startHls,
      authenticateUrl: (url) => `authenticated:${url}`,
    });

    expect(source).toEqual({
      kind: 'direct',
      url: 'authenticated:/api/stream/track-1/direct',
    });
    expect(startHls).not.toHaveBeenCalled();
  });

  it('starts HLS when direct playback is unavailable', async () => {
    const startHls = vi.fn().mockResolvedValue(hlsSession());

    const source = await resolveMusicPlaybackSource('token', 'track-1', {
      getPlan: async () => playbackPlan(false),
      startHls,
      authenticateUrl: (url) => `authenticated:${url}`,
    });

    expect(startHls).toHaveBeenCalledWith('token', 'track-1');
    expect(source).toEqual({
      kind: 'hls',
      url: 'authenticated:/api/stream/hls/session-1/index.m3u8',
    });
  });

  it('can fall back after a browser rejects a server-approved direct format', async () => {
    const startHls = vi.fn().mockResolvedValue(hlsSession());

    const source = await resolveMusicHlsFallbackSource('token', 'track-1', {
      startHls,
      authenticateUrl: (url) => `authenticated:${url}`,
    });

    expect(startHls).toHaveBeenCalledOnce();
    expect(source.kind).toBe('hls');
  });
});
