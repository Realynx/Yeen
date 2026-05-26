import type { MediaItem } from '../../shared/services/types';
import {
  SORT_OPTIONS,
  toLibraryItems,
} from './mediaLibraryUtils';
import {
  ARTWORK_LABELS,
  CHAPTER_LABELS,
  FORMAT_LABELS,
  QUALITY_LABELS,
  RELEASE_YEAR_LABELS,
  RUNTIME_LABELS,
  SUBTITLE_AVAILABILITY_LABELS,
  VIDEO_CODEC_LABELS,
  WATCH_STATUS_LABELS,
  type MediaLibraryFilterState,
} from './mediaLibraryFilterUtils';

export const LIBRARY_SEARCH_QUERY_PARAM = 'q';
export const LIBRARY_SHELF_QUERY_PARAM = 'shelf';

const DEFAULT_LIBRARY_FILTER_STATE: MediaLibraryFilterState = {
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
  sortOrder: 'updated-desc',
};

const TYPE_FILTERS = ['all', 'movie', 'show'] as const;
const SORT_VALUES = SORT_OPTIONS.map((option) => option.value);

interface LibraryPathOptions {
  q?: string | null;
  shelf?: string | null;
  filters?: Partial<MediaLibraryFilterState>;
}

export function normalizeLibrarySearchTerm(
  searchTerm: string | null | undefined,
): string {
  return searchTerm?.trim() ?? '';
}

export function toLibrarySearchPath(searchTerm: string): string {
  return toLibraryPath({ q: searchTerm });
}

export function defaultLibraryFilterState(): MediaLibraryFilterState {
  return { ...DEFAULT_LIBRARY_FILTER_STATE };
}

export function parseLibraryFilterState(
  params: URLSearchParams,
): MediaLibraryFilterState {
  return {
    typeFilter: readEnumParam(params, 'type', TYPE_FILTERS, 'all'),
    tagFilter: params.get('tag')?.trim() ?? '',
    watchStatusFilter: readEnumParam(params, 'watch', Object.keys(WATCH_STATUS_LABELS), 'all'),
    subtitleAvailabilityFilter: readEnumParam(
      params,
      'subtitles',
      Object.keys(SUBTITLE_AVAILABILITY_LABELS),
      'all',
    ),
    qualityFilter: readEnumParam(params, 'quality', Object.keys(QUALITY_LABELS), 'all'),
    runtimeFilter: readEnumParam(params, 'runtime', Object.keys(RUNTIME_LABELS), 'all'),
    releaseYearFilter: readEnumParam(params, 'year', Object.keys(RELEASE_YEAR_LABELS), 'all'),
    artworkFilter: readEnumParam(params, 'artwork', Object.keys(ARTWORK_LABELS), 'all'),
    chapterFilter: readEnumParam(params, 'chapters', Object.keys(CHAPTER_LABELS), 'all'),
    formatFilter: readEnumParam(params, 'format', Object.keys(FORMAT_LABELS), 'all'),
    videoCodecFilter: readEnumParam(params, 'codec', Object.keys(VIDEO_CODEC_LABELS), 'all'),
    sortOrder: readEnumParam(params, 'sort', SORT_VALUES, 'updated-desc'),
  };
}

export function toLibraryPath({
  q,
  shelf,
  filters,
}: LibraryPathOptions = {}): string {
  const params = new URLSearchParams();
  const normalizedSearchTerm = normalizeLibrarySearchTerm(q);

  if (normalizedSearchTerm) {
    params.set(LIBRARY_SEARCH_QUERY_PARAM, normalizedSearchTerm);
  }

  appendFilterParams(params, {
    ...DEFAULT_LIBRARY_FILTER_STATE,
    ...filters,
  }, filters);

  const normalizedShelf = shelf?.trim() ?? '';
  if (normalizedShelf) {
    params.set(LIBRARY_SHELF_QUERY_PARAM, normalizedShelf);
  }

  const queryString = params.toString();
  return queryString ? `/library?${queryString}` : '/library';
}

function appendFilterParams(
  params: URLSearchParams,
  filters: MediaLibraryFilterState,
  explicitFilters: Partial<MediaLibraryFilterState> | undefined,
): void {
  appendNonDefaultParam(params, 'type', filters.typeFilter, 'all', explicitFilters?.typeFilter !== undefined);
  appendNonDefaultParam(params, 'tag', filters.tagFilter.trim(), '', explicitFilters?.tagFilter !== undefined);
  appendNonDefaultParam(params, 'watch', filters.watchStatusFilter, 'all', explicitFilters?.watchStatusFilter !== undefined);
  appendNonDefaultParam(params, 'subtitles', filters.subtitleAvailabilityFilter, 'all', explicitFilters?.subtitleAvailabilityFilter !== undefined);
  appendNonDefaultParam(params, 'quality', filters.qualityFilter, 'all', explicitFilters?.qualityFilter !== undefined);
  appendNonDefaultParam(params, 'runtime', filters.runtimeFilter, 'all', explicitFilters?.runtimeFilter !== undefined);
  appendNonDefaultParam(params, 'year', filters.releaseYearFilter, 'all', explicitFilters?.releaseYearFilter !== undefined);
  appendNonDefaultParam(params, 'artwork', filters.artworkFilter, 'all', explicitFilters?.artworkFilter !== undefined);
  appendNonDefaultParam(params, 'chapters', filters.chapterFilter, 'all', explicitFilters?.chapterFilter !== undefined);
  appendNonDefaultParam(params, 'format', filters.formatFilter, 'all', explicitFilters?.formatFilter !== undefined);
  appendNonDefaultParam(params, 'codec', filters.videoCodecFilter, 'all', explicitFilters?.videoCodecFilter !== undefined);
  appendNonDefaultParam(params, 'sort', filters.sortOrder, 'updated-desc', explicitFilters?.sortOrder !== undefined);
}

function appendNonDefaultParam<T extends string>(
  params: URLSearchParams,
  key: string,
  value: T,
  defaultValue: T,
  force = false,
): void {
  if (force || value !== defaultValue) {
    params.set(key, value);
  }
}

function readEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowedValues: readonly string[],
  fallback: T,
): T {
  const value = params.get(key)?.trim() ?? '';
  return allowedValues.includes(value) ? value as T : fallback;
}

export function toRandomDetailsCandidates(items: MediaItem[]): MediaItem[] {
  return toLibraryItems(items).filter(
    (item) => item.digitalMediaType === 'video' && !item.isRemote,
  );
}

export function pickRandomItem<T>(items: readonly T[]): T | null {
  if (items.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex] ?? null;
}
