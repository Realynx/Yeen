import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/services/types';
import { withAuthoritativePlaybackDuration } from './playerDataDuration';

function media(durationSeconds: number): MediaItem {
  return { id: 'episode-1', durationSeconds } as MediaItem;
}

describe('withAuthoritativePlaybackDuration', () => {
  it('replaces an overstated catalog runtime with the HLS session runtime', () => {
    expect(
      withAuthoritativePlaybackDuration(media(2267), 1451),
    ).toMatchObject({ durationSeconds: 1451 });
  });

  it('retains the media runtime when no session runtime is available', () => {
    const item = media(2267);
    expect(withAuthoritativePlaybackDuration(item, null)).toBe(item);
  });
});
