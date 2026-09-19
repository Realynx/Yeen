import {
  mediaBackdropImageUrl,
  mediaPreviewImageUrl,
} from '../../shared/services/api';
import type {
  MediaItem,
  ProgressEntry,
} from '../../shared/services/types';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';

export type MediaTypeFilter = 'all' | 'movie' | 'show';
export type MediaSortOrder =
  | 'updated-desc'
  | 'title-asc'
  | 'title-desc'
  | 'year-desc'
  | 'year-asc'
  | 'duration-desc'
  | 'duration-asc';

export const SORT_OPTIONS: Array<{ value: MediaSortOrder; label: string }> = [
  { value: 'updated-desc', label: 'Recently Updated' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
  { value: 'year-desc', label: 'Release Year (Newest)' },
  { value: 'year-asc', label: 'Release Year (Oldest)' },
  { value: 'duration-desc', label: 'Duration (Longest)' },
  { value: 'duration-asc', label: 'Duration (Shortest)' },
];

export interface LibraryItemGroup {
  item: MediaItem;
  sourceItems: MediaItem[];
  showKey: string | null;
}

export function toLibraryType(item: MediaItem): Exclude<MediaTypeFilter, 'all'> {
  return item.type === 'show' ? 'show' : 'movie';
}

function isHttpUrl(value: string | null | undefined): value is string {
  return value?.startsWith('http://') || value?.startsWith('https://') || false;
}

export function artworkUrlForMedia(item: MediaItem): string | null {
  const cacheVersion = item.metadataRefreshedAt || item.updatedAt;

  if (isHttpUrl(item.previewImagePath)) {
    return item.previewImagePath;
  }

  if (item.previewImagePath) {
    return mediaPreviewImageUrl(item.id, cacheVersion);
  }

  if (isHttpUrl(item.backdropImagePath)) {
    return item.backdropImagePath;
  }

  if (item.backdropImagePath) {
    return mediaBackdropImageUrl(item.id, cacheVersion);
  }

  return null;
}

export function toProgressMap(entries: ProgressEntry[]): Map<string, ProgressEntry> {
  const map = new Map<string, ProgressEntry>();
  for (const entry of entries) {
    map.set(entry.mediaId, entry);
  }
  return map;
}

export function toProgressPercent(entry: ProgressEntry | undefined): number | undefined {
  if (!entry) {
    return undefined;
  }

  return (entry.positionSeconds / Math.max(entry.durationSeconds, 1)) * 100;
}

export function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toEpisodeSortValue(item: MediaItem): number {
  const season = item.seasonNumber ?? Number.MAX_SAFE_INTEGER;
  const episode = item.episodeNumber ?? Number.MAX_SAFE_INTEGER;
  return (season * 10_000) + episode;
}

function hasPosterArtwork(item: MediaItem): boolean {
  return Boolean(item.previewImagePath?.trim());
}

function hasArtwork(item: MediaItem): boolean {
  return hasPosterArtwork(item) || Boolean(item.backdropImagePath?.trim());
}

function toRepresentativeTimestamp(item: MediaItem): number {
  return Math.max(toTimestamp(item.metadataRefreshedAt), toTimestamp(item.updatedAt));
}

function pickArtworkRepresentative(items: MediaItem[], fallback: MediaItem): MediaItem {
  const withArtwork = items.filter(hasArtwork);
  if (withArtwork.length === 0) {
    return fallback;
  }

  return [...withArtwork].sort((left, right) => {
    const posterAvailabilityDelta = Number(hasPosterArtwork(right)) - Number(hasPosterArtwork(left));
    if (posterAvailabilityDelta !== 0) {
      return posterAvailabilityDelta;
    }

    const freshnessDelta = toRepresentativeTimestamp(right) - toRepresentativeTimestamp(left);
    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    const orderDelta = toEpisodeSortValue(left) - toEpisodeSortValue(right);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  })[0] ?? fallback;
}

export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

function toShowAggregateItem(items: MediaItem[]): MediaItem {
  const sorted = [...items].sort((left, right) => {
    const orderDelta = toEpisodeSortValue(left) - toEpisodeSortValue(right);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });

  const representative = pickArtworkRepresentative(sorted, sorted[0] ?? items[0]);
  const releaseYears = items
    .map((item) => item.releaseYear)
    .filter((year): year is number => typeof year === 'number' && Number.isFinite(year));

  const releaseYear = releaseYears.length > 0
    ? Math.min(...releaseYears)
    : representative.releaseYear;

  const durationSeconds = items.reduce(
    (total, item) => total + Math.max(item.durationSeconds, 0),
    0,
  );

  const metadataRefreshedAt = items.reduce((latest, item) => {
    return toTimestamp(item.metadataRefreshedAt) > toTimestamp(latest)
      ? item.metadataRefreshedAt
      : latest;
  }, representative.metadataRefreshedAt);

  const updatedAt = items.reduce((latest, item) => {
    return toTimestamp(item.updatedAt) > toTimestamp(latest)
      ? item.updatedAt
      : latest;
  }, representative.updatedAt);
  const tags = normalizeTags(items.flatMap((item) => item.tags));

  return {
    ...representative,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    tags,
    releaseYear,
    durationSeconds,
    metadataRefreshedAt,
    updatedAt,
  };
}

export function toLibraryItems(items: MediaItem[]): MediaItem[] {
  return toLibraryItemGroups(items).map((group) => group.item);
}

export function toLibraryItemGroups(items: MediaItem[]): LibraryItemGroup[] {
  const deduplicated: MediaItem[] = [];
  const groupedShows = new Map<string, MediaItem[]>();

  for (const item of items) {
    if (item.type !== 'show') {
      deduplicated.push(item);
      continue;
    }

    const key = normalizeShowKey(item);
    const existing = groupedShows.get(key);
    if (existing) {
      existing.push(item);
      continue;
    }

    groupedShows.set(key, [item]);
  }

  const groups: LibraryItemGroup[] = deduplicated.map((item) => ({
    item,
    sourceItems: [item],
    showKey: null,
  }));

  for (const [showKey, group] of groupedShows.entries()) {
    groups.push({
      item: toShowAggregateItem(group),
      sourceItems: [...group],
      showKey,
    });
  }

  return groups;
}

export function sortMediaItems(items: MediaItem[], sortOrder: MediaSortOrder): MediaItem[] {
  const sorted = [...items];

  sorted.sort((left, right) => {
    if (sortOrder === 'title-asc') {
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    }

    if (sortOrder === 'title-desc') {
      return right.title.localeCompare(left.title, undefined, { sensitivity: 'base' });
    }

    if (sortOrder === 'year-desc') {
      const leftYear = left.releaseYear ?? Number.MIN_SAFE_INTEGER;
      const rightYear = right.releaseYear ?? Number.MIN_SAFE_INTEGER;
      if (leftYear !== rightYear) {
        return rightYear - leftYear;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    }

    if (sortOrder === 'year-asc') {
      const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
      const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
      if (leftYear !== rightYear) {
        return leftYear - rightYear;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    }

    if (sortOrder === 'duration-desc') {
      if (left.durationSeconds !== right.durationSeconds) {
        return right.durationSeconds - left.durationSeconds;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    }

    if (sortOrder === 'duration-asc') {
      if (left.durationSeconds !== right.durationSeconds) {
        return left.durationSeconds - right.durationSeconds;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    }

    return toTimestamp(right.metadataRefreshedAt) - toTimestamp(left.metadataRefreshedAt);
  });

  return sorted;
}
