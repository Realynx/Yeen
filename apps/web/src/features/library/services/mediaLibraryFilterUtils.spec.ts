import { describe, expect, it } from 'vitest';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import {
  filterAndSortMediaLibraryItems,
  type MediaLibraryFilterState,
} from './mediaLibraryFilterUtils';

function createMedia(overrides: Partial<MediaItem> & { id: string; title: string }): MediaItem {
  const extension = overrides.extension ?? '.mkv';
  const defaults: MediaItem = {
    id: overrides.id,
    title: overrides.title,
    normalizedTitle: overrides.title.toLowerCase(),
    tags: [],
    description: null,
    releaseYear: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    dedupeKey: overrides.id,
    relativePath: `${overrides.title}${extension}`,
    filePath: `C:\\media\\${overrides.title}${extension}`,
    extension,
    container: null,
    type: 'movie',
    digitalMediaType: 'video',
    sizeBytes: 100,
    durationSeconds: 5400,
    width: 1920,
    height: 1080,
    videoCodec: null,
    audioCodec: null,
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: null,
    backdropImagePath: null,
    chapterThumbnails: [],
    mediaDetails: { formatName: null, bitRate: null, frameRate: null, audioChannels: null },
    metadataRefreshedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...defaults, ...overrides };
}

function defaultState(overrides: Partial<MediaLibraryFilterState>): MediaLibraryFilterState {
  return {
    typeFilter: 'all',
    tagFilter: '',
    watchStatusFilter: 'all',
    subtitleAvailabilityFilter: 'all',
    qualityFilter: 'all',
    runtimeFilter: 'all',
    releaseYearFilter: 'all',
    artworkFilter: 'all',
    chapterFilter: 'all',
    formatFilter: 'all',
    videoCodecFilter: 'all',
    sortOrder: 'title-asc',
    ...overrides,
  };
}

function createProgress(overrides: Partial<ProgressEntry> & { mediaId: string }): ProgressEntry {
  return {
    mediaId: overrides.mediaId,
    positionSeconds: overrides.positionSeconds ?? 600,
    durationSeconds: overrides.durationSeconds ?? 5400,
    completed: overrides.completed ?? false,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('mediaLibraryFilterUtils', () => {
  it('combines quality, subtitles, artwork, chapters, format, and codec filters', () => {
    const premium = createMedia({
      id: 'premium',
      title: 'Premium',
      height: 2160,
      subtitleStreams: 1,
      previewImagePath: 'poster.jpg',
      backdropImagePath: 'backdrop.jpg',
      chapterThumbnails: [{ imagePath: 'chapter.jpg', second: 60 }],
      extension: '.mkv',
      videoCodec: 'hevc',
    });
    const basic = createMedia({
      id: 'basic',
      title: 'Basic',
      height: 480,
      extension: '.avi',
      videoCodec: 'mpeg4',
    });

    const result = filterAndSortMediaLibraryItems(
      [basic, premium],
      new Map(),
      defaultState({
        qualityFilter: 'uhd',
        subtitleAvailabilityFilter: 'has-subtitles',
        artworkFilter: 'has-backdrop',
        chapterFilter: 'has-chapters',
        formatFilter: 'mkv',
        videoCodecFilter: 'h265',
      }),
    );

    expect(result.map((item) => item.id)).toEqual(['premium']);
  });

  it('combines watch status, runtime, and year filters', () => {
    const shortNew = createMedia({
      id: 'short-new',
      title: 'Short New',
      durationSeconds: 20 * 60,
      releaseYear: 2026,
    });
    const longOld = createMedia({
      id: 'long-old',
      title: 'Long Old',
      durationSeconds: 150 * 60,
      releaseYear: 2001,
    });

    const result = filterAndSortMediaLibraryItems(
      [longOld, shortNew],
      new Map([
        ['short-new', createProgress({ mediaId: 'short-new', positionSeconds: 200 })],
      ]),
      defaultState({
        watchStatusFilter: 'in-progress',
        runtimeFilter: 'short',
        releaseYearFilter: 'new',
      }),
    );

    expect(result.map((item) => item.id)).toEqual(['short-new']);
  });
});
