import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import {
  normalizeTags,
  sortMediaItems,
  toLibraryType,
  type MediaSortOrder,
  type MediaTypeFilter,
} from './mediaLibraryUtils';

export type WatchStatusFilter = 'all' | 'unwatched' | 'in-progress' | 'watched';
export type SubtitleAvailabilityFilter = 'all' | 'has-subtitles' | 'missing-subtitles';
export type QualityFilter = 'all' | 'uhd' | 'hd' | 'sd' | 'unknown';
export type RuntimeFilter = 'all' | 'short' | 'standard' | 'long' | 'unknown';
export type ReleaseYearFilter = 'all' | 'new' | '2020s' | '2010s' | 'older' | 'unknown';
export type ArtworkFilter = 'all' | 'has-artwork' | 'missing-poster' | 'has-backdrop';
export type ChapterFilter = 'all' | 'has-chapters' | 'no-chapters';
export type FormatFilter = 'all' | 'mkv' | 'mp4' | 'other';
export type VideoCodecFilter = 'all' | 'h264' | 'h265' | 'av1' | 'other' | 'unknown';

export interface MediaLibraryFilterState {
  typeFilter: MediaTypeFilter;
  tagFilter: string;
  watchStatusFilter: WatchStatusFilter;
  subtitleAvailabilityFilter: SubtitleAvailabilityFilter;
  qualityFilter: QualityFilter;
  runtimeFilter: RuntimeFilter;
  releaseYearFilter: ReleaseYearFilter;
  artworkFilter: ArtworkFilter;
  chapterFilter: ChapterFilter;
  formatFilter: FormatFilter;
  videoCodecFilter: VideoCodecFilter;
  sortOrder: MediaSortOrder;
}

export const WATCH_STATUS_LABELS: Record<WatchStatusFilter, string> = {
  all: 'All',
  unwatched: 'Unwatched',
  'in-progress': 'In Progress',
  watched: 'Watched',
};

export const SUBTITLE_AVAILABILITY_LABELS: Record<SubtitleAvailabilityFilter, string> = {
  all: 'All Subtitles',
  'has-subtitles': 'Has Subtitles',
  'missing-subtitles': 'Missing Subtitles',
};

export const QUALITY_LABELS: Record<QualityFilter, string> = {
  all: 'All Quality',
  uhd: '4K / UHD',
  hd: 'HD',
  sd: 'SD',
  unknown: 'Unknown Quality',
};

export const RUNTIME_LABELS: Record<RuntimeFilter, string> = {
  all: 'Any Runtime',
  short: 'Short',
  standard: 'Standard',
  long: 'Long',
  unknown: 'Unknown Runtime',
};

export const RELEASE_YEAR_LABELS: Record<ReleaseYearFilter, string> = {
  all: 'Any Year',
  new: 'New Releases',
  '2020s': '2020s',
  '2010s': '2010s',
  older: 'Older',
  unknown: 'Unknown Year',
};

export const ARTWORK_LABELS: Record<ArtworkFilter, string> = {
  all: 'Any Artwork',
  'has-artwork': 'Has Poster',
  'missing-poster': 'Missing Poster',
  'has-backdrop': 'Has Backdrop',
};

export const CHAPTER_LABELS: Record<ChapterFilter, string> = {
  all: 'Any Chapters',
  'has-chapters': 'Has Chapters',
  'no-chapters': 'No Chapters',
};

export const FORMAT_LABELS: Record<FormatFilter, string> = {
  all: 'Any Format',
  mkv: 'MKV',
  mp4: 'MP4',
  other: 'Other Format',
};

export const VIDEO_CODEC_LABELS: Record<VideoCodecFilter, string> = {
  all: 'Any Codec',
  h264: 'H.264',
  h265: 'H.265 / HEVC',
  av1: 'AV1',
  other: 'Other Codec',
  unknown: 'Unknown Codec',
};

export function filterAndSortMediaLibraryItems(
  libraryItems: readonly MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
  state: MediaLibraryFilterState,
): MediaItem[] {
  const normalizedTagFilter = state.tagFilter.trim().toLowerCase();
  const filtered = libraryItems.filter((item) => {
    return (
      matchesTypeFilter(item, state.typeFilter)
      && matchesTagFilter(item, normalizedTagFilter)
      && matchOrAll(toWatchStatus(progressMap.get(item.id)), state.watchStatusFilter)
      && matchOrAll(toSubtitleAvailability(item), state.subtitleAvailabilityFilter)
      && matchOrAll(toQualityBucket(item), state.qualityFilter)
      && matchOrAll(toRuntimeBucket(item), state.runtimeFilter)
      && matchesReleaseYearFilter(item, state.releaseYearFilter)
      && matchesArtworkFilter(item, state.artworkFilter)
      && matchOrAll(toChapterBucket(item), state.chapterFilter)
      && matchOrAll(toFormatBucket(item), state.formatFilter)
      && matchOrAll(toVideoCodecBucket(item), state.videoCodecFilter)
    );
  });

  return sortMediaItems(filtered, state.sortOrder);
}

export function toActiveLibraryFilterLabels(
  activeSearch: string | null,
  state: MediaLibraryFilterState,
): string[] {
  return [
    activeSearch ? `matches for "${activeSearch}"` : null,
    state.typeFilter === 'all' ? null : `${state.typeFilter}s`,
    state.tagFilter ? `tag "${state.tagFilter}"` : null,
    activeLabel(state.watchStatusFilter, WATCH_STATUS_LABELS),
    activeLabel(state.subtitleAvailabilityFilter, SUBTITLE_AVAILABILITY_LABELS),
    activeLabel(state.qualityFilter, QUALITY_LABELS),
    activeLabel(state.runtimeFilter, RUNTIME_LABELS),
    activeLabel(state.releaseYearFilter, RELEASE_YEAR_LABELS),
    activeLabel(state.artworkFilter, ARTWORK_LABELS),
    activeLabel(state.chapterFilter, CHAPTER_LABELS),
    activeLabel(state.formatFilter, FORMAT_LABELS),
    activeLabel(state.videoCodecFilter, VIDEO_CODEC_LABELS),
  ].filter((label): label is string => Boolean(label));
}

export function hasActiveLibraryFilters(
  activeSearch: string | null,
  state: MediaLibraryFilterState,
): boolean {
  return toActiveLibraryFilterLabels(activeSearch, state).length > 0;
}

function activeLabel<T extends string>(value: T, labels: Record<T, string>): string | null {
  return value === 'all' ? null : labels[value].toLowerCase();
}

function matchesTypeFilter(item: MediaItem, typeFilter: MediaTypeFilter): boolean {
  return typeFilter === 'all' || toLibraryType(item) === typeFilter;
}

function matchesTagFilter(item: MediaItem, normalizedTagFilter: string): boolean {
  return !normalizedTagFilter
    || normalizeTags(item.tags).some((tag) => tag.toLowerCase() === normalizedTagFilter);
}

function matchOrAll<T extends string>(actual: T, expected: T): boolean {
  return expected === 'all' || actual === expected;
}

function toWatchStatus(progress: ProgressEntry | undefined): WatchStatusFilter {
  if (!progress || progress.positionSeconds < 60) {
    return 'unwatched';
  }

  const percent = (progress.positionSeconds / Math.max(progress.durationSeconds, 1)) * 100;
  return progress.completed || percent >= 95 ? 'watched' : 'in-progress';
}

function toSubtitleAvailability(item: MediaItem): SubtitleAvailabilityFilter {
  return item.subtitleStreams > 0 || item.subtitleDetails.length > 0
    ? 'has-subtitles'
    : 'missing-subtitles';
}

function toQualityBucket(item: MediaItem): QualityFilter {
  if (!item.height) {
    return 'unknown';
  }

  if (item.height >= 2160) {
    return 'uhd';
  }

  return item.height >= 720 ? 'hd' : 'sd';
}

function toRuntimeBucket(item: MediaItem): RuntimeFilter {
  if (!item.durationSeconds || item.durationSeconds <= 0) {
    return 'unknown';
  }

  if (item.durationSeconds <= 30 * 60) {
    return 'short';
  }

  return item.durationSeconds <= 120 * 60 ? 'standard' : 'long';
}

function matchesReleaseYearFilter(item: MediaItem, filter: ReleaseYearFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (!item.releaseYear) {
    return filter === 'unknown';
  }

  const currentYear = new Date().getFullYear();
  if (filter === 'new') {
    return item.releaseYear >= currentYear - 2;
  }

  if (filter === '2020s') {
    return item.releaseYear >= 2020 && item.releaseYear <= 2029;
  }

  if (filter === '2010s') {
    return item.releaseYear >= 2010 && item.releaseYear <= 2019;
  }

  return item.releaseYear < 2010;
}

function matchesArtworkFilter(item: MediaItem, filter: ArtworkFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'has-artwork') {
    return Boolean(item.previewImagePath);
  }

  if (filter === 'has-backdrop') {
    return Boolean(item.backdropImagePath);
  }

  return !item.previewImagePath;
}

function toChapterBucket(item: MediaItem): ChapterFilter {
  return item.chapterThumbnails.length > 0 ? 'has-chapters' : 'no-chapters';
}

function toFormatBucket(item: MediaItem): FormatFilter {
  const extension = item.extension.trim().replace(/^\./, '').toLowerCase();
  if (extension === 'mkv') {
    return 'mkv';
  }

  return extension === 'mp4' || extension === 'm4v' ? 'mp4' : 'other';
}

function toVideoCodecBucket(item: MediaItem): VideoCodecFilter {
  const codec = (item.videoCodec ?? '').trim().toLowerCase();
  if (!codec) {
    return 'unknown';
  }

  if (codec.includes('264') || codec.includes('avc')) {
    return 'h264';
  }

  if (codec.includes('265') || codec.includes('hevc')) {
    return 'h265';
  }

  return codec.includes('av1') ? 'av1' : 'other';
}
