import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/services/types';
import {
  filterMusicItemsByArtist,
  filterMusicItems,
  formatMusicDuration,
  groupMusicAlbums,
} from './musicLibraryUtils';

function track(id: string, title: string, album: string, trackNumber: number): MediaItem {
  return {
    id,
    title,
    normalizedTitle: title.toLowerCase(),
    tags: [],
    description: null,
    releaseYear: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    dedupeKey: id,
    relativePath: `${title}.flac`,
    filePath: `${title}.flac`,
    extension: '.flac',
    container: 'flac',
    type: 'other',
    digitalMediaType: 'audio',
    libraryType: 'music',
    musicMetadata: {
      artist: 'An Artist',
      album,
      albumArtist: 'An Artist',
      trackNumber,
      discNumber: 1,
      genre: 'Electronic',
      artworkKind: 'none',
    },
    sizeBytes: 1,
    durationSeconds: 185,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: 'flac',
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: null,
    backdropImagePath: null,
    chapterThumbnails: [],
    mediaDetails: { formatName: 'flac', bitRate: null, frameRate: null, audioChannels: 2 },
    metadataRefreshedAt: '',
    updatedAt: '',
  };
}

describe('music library utilities', () => {
  it('groups album tracks in disc and track order', () => {
    const albums = groupMusicAlbums([
      track('2', 'Second', 'A Record', 2),
      track('1', 'First', 'A Record', 1),
    ]);

    expect(albums).toHaveLength(1);
    expect(albums[0].tracks.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('searches title, artist, album, and genre', () => {
    expect(filterMusicItems([track('1', 'First', 'A Record', 1)], 'electronic')).toHaveLength(1);
  });

  it('filters an artist case-insensitively and can clear the filter', () => {
    const first = track('1', 'First', 'A Record', 1);
    const second = track('2', 'Second', 'Another Record', 1);
    second.musicMetadata = { ...second.musicMetadata!, artist: 'Another Artist' };

    expect(filterMusicItemsByArtist([first, second], 'an artist')).toEqual([first]);
    expect(filterMusicItemsByArtist([first, second], null)).toEqual([first, second]);
  });

  it('formats track duration', () => {
    expect(formatMusicDuration(185)).toBe('3:05');
    expect(formatMusicDuration(0)).toBe('0:00');
  });
});
