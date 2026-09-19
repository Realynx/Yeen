import { buildMediaDedupeKey } from './media-dedupe-key';

describe('buildMediaDedupeKey', () => {
  it('uses artist, album, disc, track, and title for music identity', () => {
    expect(
      buildMediaDedupeKey({
        type: 'other',
        normalizedTitle: 'midnight city',
        releaseYear: 2011,
        seasonNumber: null,
        episodeNumber: null,
        durationSeconds: 244,
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
      }),
    ).toBe('music:m83:hurry up we re dreaming:d1:t3:midnight city');
  });

  it('preserves the legacy video key format', () => {
    expect(
      buildMediaDedupeKey({
        type: 'movie',
        normalizedTitle: 'arrival',
        releaseYear: 2016,
        seasonNumber: null,
        episodeNumber: null,
        durationSeconds: 6960,
        libraryType: 'video',
        musicMetadata: null,
      }),
    ).toBe('movie:arrival:y2016');
  });
});
