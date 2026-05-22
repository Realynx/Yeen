import { mediaBackdropImageUrl, mediaPreviewImageUrl } from '../../lib/api';
import type { MediaItem, ProgressEntry } from '../../lib/types';
import { normalizeShowKey } from '../media-details/mediaDetailsUtils';

export interface TaggedMovieRow {
  id: string;
  label: string;
  items: MediaItem[];
}

export const MIN_TAG_ROW_ITEMS = 7;
export const MAX_TAG_ROW_ITEMS = 15;

function isHttpUrl(value: string | null | undefined): value is string {
  return value?.startsWith('http://') || value?.startsWith('https://') || false;
}

function toEpisodeSortValue(item: MediaItem): number {
  const season = item.seasonNumber ?? Number.MAX_SAFE_INTEGER;
  const episode = item.episodeNumber ?? Number.MAX_SAFE_INTEGER;
  return (season * 10_000) + episode;
}

function hasArtwork(item: MediaItem): boolean {
  return Boolean(item.backdropImagePath?.trim() || item.previewImagePath?.trim());
}

export function formatDuration(seconds: number): string {
  if (!seconds) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function toQualityLabel(item: MediaItem): string {
  if (!item.height) {
    return 'SD';
  }

  if (item.height >= 2160) {
    return '4K';
  }

  if (item.height >= 1080) {
    return 'HD';
  }

  if (item.height >= 720) {
    return '720p';
  }

  return `${item.height}p`;
}

export function toProgressMap(entries: ProgressEntry[]) {
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

export function isEpisodeEntry(item: MediaItem): boolean {
  return (
    typeof item.seasonNumber === 'number'
    || typeof item.episodeNumber === 'number'
  );
}

export function toSeasonEpisodeLabel(item: MediaItem): string | null {
  const isSeriesLike = item.type === 'show' || isEpisodeEntry(item);
  if (!isSeriesLike) {
    return null;
  }

  if (
    typeof item.seasonNumber !== 'number'
    || typeof item.episodeNumber !== 'number'
  ) {
    return null;
  }

  const season = String(item.seasonNumber).padStart(2, '0');
  const episode = String(item.episodeNumber).padStart(2, '0');
  return `S${season} E${episode}`;
}

export function toRepresentativeTimestamp(item: MediaItem): number {
  const refreshedAt = Date.parse(item.metadataRefreshedAt);
  const updatedAt = Date.parse(item.updatedAt);
  const refreshed = Number.isFinite(refreshedAt) ? refreshedAt : 0;
  const updated = Number.isFinite(updatedAt) ? updatedAt : 0;
  return Math.max(refreshed, updated);
}

function shouldReplaceShowRepresentative(
  existing: MediaItem,
  candidate: MediaItem,
): boolean {
  const existingIsEpisode = isEpisodeEntry(existing);
  const candidateIsEpisode = isEpisodeEntry(candidate);

  const existingHasArtwork = hasArtwork(existing);
  const candidateHasArtwork = hasArtwork(candidate);
  if (existingHasArtwork !== candidateHasArtwork) {
    return candidateHasArtwork;
  }

  const freshnessDelta =
    toRepresentativeTimestamp(candidate) - toRepresentativeTimestamp(existing);
  if (freshnessDelta !== 0) {
    return freshnessDelta > 0;
  }

  if (existingIsEpisode !== candidateIsEpisode) {
    return !candidateIsEpisode;
  }

  const existingOrder = toEpisodeSortValue(existing);
  const candidateOrder = toEpisodeSortValue(candidate);

  if (candidateOrder !== existingOrder) {
    return candidateOrder < existingOrder;
  }

  return (
    candidate.title.localeCompare(existing.title, undefined, {
      sensitivity: 'base',
    }) < 0
  );
}

export function consolidateShowSearchResults(items: MediaItem[]): MediaItem[] {
  const consolidated: MediaItem[] = [];
  const showIndexByKey = new Map<string, number>();

  for (const item of items) {
    if (item.type !== 'show') {
      consolidated.push(item);
      continue;
    }

    const showKey = normalizeShowKey(item);
    const existingIndex = showIndexByKey.get(showKey);

    if (typeof existingIndex === 'undefined') {
      showIndexByKey.set(showKey, consolidated.length);
      consolidated.push(item);
      continue;
    }

    const existing = consolidated[existingIndex];
    if (shouldReplaceShowRepresentative(existing, item)) {
      consolidated[existingIndex] = item;
    }
  }

  return consolidated;
}

export function seededHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function toRandomizedItems(items: MediaItem[], seed: number): MediaItem[] {
  return [...items].sort((left, right) => {
    const leftScore = seededHash(`${seed}:${left.id}`);
    const rightScore = seededHash(`${seed}:${right.id}`);
    return leftScore - rightScore;
  });
}

export function normalizeHomeMovieTagKey(tag: string): string {
  const normalized = tag.trim().toLowerCase();
  return normalized === 'action' ? 'animation' : normalized;
}

export function toHomeMovieTagLabel(tag: string): string {
  const normalizedKey = normalizeHomeMovieTagKey(tag);
  if (normalizedKey === 'animation') {
    return 'Animation';
  }

  return tag.trim();
}

export function toTagRowMediaKey(item: MediaItem): string {
  if (item.type === 'show' || isEpisodeEntry(item)) {
    const showKey = normalizeShowKey(item);
    if (showKey) {
      return `show:${showKey}`;
    }
  }

  return `media:${item.id}`;
}

export function shouldReplaceTagRowRepresentative(
  existing: MediaItem,
  candidate: MediaItem,
): boolean {
  const existingIsSeriesLike = existing.type === 'show' || isEpisodeEntry(existing);
  const candidateIsSeriesLike = candidate.type === 'show' || isEpisodeEntry(candidate);

  if (existingIsSeriesLike && candidateIsSeriesLike) {
    return shouldReplaceShowRepresentative(existing, candidate);
  }

  if (existing.id === candidate.id) {
    return toRepresentativeTimestamp(candidate) > toRepresentativeTimestamp(existing);
  }

  return false;
}

export function toRandomShowRepresentative(
  showItems: MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
): MediaItem {
  const watchedItems = showItems.filter((item) => progressMap.has(item.id));

  if (watchedItems.length > 0) {
    return watchedItems.reduce((best, candidate) => {
      const bestProgress = progressMap.get(best.id);
      const candidateProgress = progressMap.get(candidate.id);
      const bestUpdatedAt = bestProgress ? Date.parse(bestProgress.updatedAt) : 0;
      const candidateUpdatedAt = candidateProgress ? Date.parse(candidateProgress.updatedAt) : 0;

      if (candidateUpdatedAt !== bestUpdatedAt) {
        return candidateUpdatedAt > bestUpdatedAt ? candidate : best;
      }

      return toEpisodeSortValue(candidate) < toEpisodeSortValue(best)
        ? candidate
        : best;
    });
  }

  const seriesLevel = showItems.find((item) => !isEpisodeEntry(item));
  if (seriesLevel) {
    return seriesLevel;
  }

  return showItems.reduce((best, candidate) => {
    const bestOrder = toEpisodeSortValue(best);
    const candidateOrder = toEpisodeSortValue(candidate);

    if (candidateOrder !== bestOrder) {
      return candidateOrder < bestOrder ? candidate : best;
    }

    return candidate.title.localeCompare(best.title, undefined, {
      sensitivity: 'base',
    }) < 0
      ? candidate
      : best;
  });
}

export function toFeaturedDedupKey(item: MediaItem): string {
  if (item.type === 'show') {
    const showKey = normalizeShowKey(item);
    if (showKey) {
      return `show:${showKey}`;
    }
  }

  return `media:${item.id}`;
}

export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(cleaned);
  }

  return normalized;
}

export function toTagSlug(tag: string): string {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'untagged';
}

export function artworkUrlForMedia(item: MediaItem): string | null {
  const cacheVersion = item.metadataRefreshedAt || item.updatedAt;

  if (isHttpUrl(item.backdropImagePath)) {
    return item.backdropImagePath;
  }

  if (item.backdropImagePath) {
    return mediaBackdropImageUrl(item.id, cacheVersion);
  }

  if (isHttpUrl(item.previewImagePath)) {
    return item.previewImagePath;
  }

  if (item.previewImagePath) {
    return mediaPreviewImageUrl(item.id, cacheVersion);
  }

  return null;
}
