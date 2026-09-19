import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/services/types';
import { findRemoteLibraryMatch } from './remoteLibraryMatch';

function media(overrides: Partial<MediaItem>): MediaItem {
  return {
    id: 'item',
    title: 'Spirited Away',
    normalizedTitle: 'spirited away',
    tags: [],
    description: null,
    releaseYear: 2001,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    dedupeKey: 'movie:spirited-away',
    relativePath: 'Spirited Away.mkv',
    filePath: '/media/Spirited Away.mkv',
    extension: '.mkv',
    container: 'matroska',
    type: 'movie',
    digitalMediaType: 'video',
    libraryType: 'video',
    musicMetadata: null,
    sizeBytes: 1,
    durationSeconds: 1,
    width: 1920,
    height: 1080,
    videoCodec: 'h264',
    audioCodec: 'aac',
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: null,
    backdropImagePath: null,
    chapterThumbnails: [],
    mediaDetails: {
      formatName: null,
      bitRate: null,
      frameRate: null,
      audioChannels: null,
    },
    metadataRefreshedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('findRemoteLibraryMatch', () => {
  it('prefers an exact provider identity match', () => {
    const remote = media({
      id: 'remote_tmdb_movie_129',
      isRemote: true,
      remoteSource: 'tmdb',
      remoteSourceId: '129',
    });
    const local = media({
      id: 'local-spirited-away',
      remoteSource: 'tmdb',
      remoteSourceId: '129',
    });

    expect(findRemoteLibraryMatch(remote, [local])?.id).toBe(local.id);
  });

  it('falls back to the catalog title, type, and year identity rule', () => {
    const remote = media({ id: 'remote_tmdb_movie_129', isRemote: true });
    const local = media({ id: 'local-spirited-away' });

    expect(findRemoteLibraryMatch(remote, [local])?.id).toBe(local.id);
    expect(
      findRemoteLibraryMatch(remote, [media({ releaseYear: 2002 })]),
    ).toBeNull();
  });
});
