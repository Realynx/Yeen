import { describe, expect, it } from 'vitest';
import { resolvePlaybackSourceForMedia } from './usePlayerData';

describe('broadcast playback source ownership', () => {
  it('invalidates the old HLS source synchronously when the route changes media', () => {
    const oldSource = {
      hls: true as const,
      url: '/api/stream/hls/old/master.m3u8',
      hlsSessionId: 'old-session',
      audioStreamIndex: null,
      maxVideoBitrateKbps: null,
      audioBitrateKbps: null,
      maxOutputHeight: null,
    };

    expect(resolvePlaybackSourceForMedia(oldSource, 'media-old', 'media-new'))
      .toBeNull();
    expect(resolvePlaybackSourceForMedia(oldSource, 'media-old', 'media-old'))
      .toBe(oldSource);
  });
});
