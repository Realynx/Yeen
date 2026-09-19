import type { MediaItem } from '../../domain/entities/media-item.entity';
import { listValue } from './media-service-list.helper';

const items = [
  {
    id: 'video-1',
    title: 'Arrival',
    description: null,
    relativePath: 'Movies/Arrival.mkv',
    tags: ['Science Fiction'],
    libraryType: 'video',
    musicMetadata: null,
  },
  {
    id: 'music-1',
    title: 'Midnight City',
    description: null,
    relativePath: 'M83/Hurry Up/Midnight City.flac',
    tags: ['Electronic'],
    libraryType: 'music',
    musicMetadata: {
      artist: 'M83',
      album: 'Hurry Up, We’re Dreaming',
      albumArtist: 'M83',
      trackNumber: 3,
      discNumber: 1,
      genre: 'Electronic',
      artworkKind: 'embedded',
    },
  },
] as unknown as MediaItem[];

describe('media list filtering', () => {
  const context = {
    mediaStore: { all: jest.fn(() => Promise.resolve(items)) },
  };

  it('filters by library type', async () => {
    await expect(listValue(context as never, '', [], 'music')).resolves.toEqual(
      [items[1]],
    );
  });

  it('searches artist and album metadata', async () => {
    await expect(listValue(context as never, 'm83')).resolves.toEqual([
      items[1],
    ]);
    await expect(listValue(context as never, 'dreaming')).resolves.toEqual([
      items[1],
    ]);
  });
});
