import { describe, expect, it, vi } from 'vitest';
import type { BroadcastPublicSession } from '../../shared/services/types';
import { resolvePublicBroadcastHlsLoadPlan } from './publicBroadcastHlsLoadPlan';

describe('public broadcast HLS load plan', () => {
  it('starts a new HLS source at the authoritative broadcaster position', () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000);
    const status = {
      isLive: true,
      manifestUrl: '/manifest.m3u8',
      playbackPositionSeconds: 125,
      playbackIsPlaying: false,
    } as BroadcastPublicSession;

    expect(resolvePublicBroadcastHlsLoadPlan({ status, receivedAtMs: 20_000 })).toEqual({
      autoStartLoad: false,
      startPosition: 125,
    });
  });
});
