import type { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaPlaybackService } from './media-playback.service';

describe('MediaPlaybackService music playback plan', () => {
  const createService = () =>
    new MediaPlaybackService(
      {} as never,
      {} as never,
      {} as never,
      { decoratePlaybackPlan: jest.fn(() => Promise.resolve({})) } as never,
    );

  it('direct-plays a compatible indexed audio track', async () => {
    const item = {
      id: 'track-1',
      title: 'Midnight City',
      extension: '.mp3',
      libraryType: 'music',
      audioCodec: 'mp3',
    } as unknown as MediaItem;

    await expect(createService().getPlaybackPlan(item)).resolves.toEqual(
      expect.objectContaining({
        directPlay: {
          supported: true,
          url: '/api/stream/track-1/direct',
        },
      }),
    );
  });
});
