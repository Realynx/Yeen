import { MediaItem } from '../../../domain/entities/media-item.entity';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';

export interface EpisodeCatalogLink {
  source: 'jikan' | 'tmdb';
  providerId: string;
}

export function resolveEpisodeCatalogLink(item: MediaItem): EpisodeCatalogLink | null {
  const linkedSource = normalizeEpisodeCatalogSource(
    normalizeOptionalString(item.episodeCatalogSource),
  );
  const linkedId = normalizeOptionalString(item.episodeCatalogSourceId);

  if (linkedSource && linkedId) {
    return {
      source: linkedSource,
      providerId: linkedId,
    };
  }

  if (item.remoteSource === 'tmdb' || item.remoteSource === 'jikan') {
    const remoteSourceId = normalizeOptionalString(item.remoteSourceId);
    if (remoteSourceId) {
      return {
        source: item.remoteSource,
        providerId: remoteSourceId,
      };
    }
  }

  return null;
}

export function episodeCatalogLinksEqual(
  left: EpisodeCatalogLink | null,
  right: EpisodeCatalogLink | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.source === right.source && left.providerId === right.providerId;
}

export function collectSeriesItemsForEpisodeTracker(
  items: MediaItem[],
  current: MediaItem,
  catalogLink: EpisodeCatalogLink,
): MediaItem[] {
  const byLinkedSource = items.filter(
    (item) =>
      item.type === 'show' &&
      episodeCatalogLinksEqual(resolveEpisodeCatalogLink(item), catalogLink),
  );

  if (byLinkedSource.length > 0) {
    return byLinkedSource;
  }

  const normalizedTitle = normalizeForKey(current.title);
  return items.filter(
    (item) => item.type === 'show' && normalizeForKey(item.title) === normalizedTitle,
  );
}

export function coercePositiveEpisodeNumber(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

export function coerceSeasonForTracker(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : 1;
}

export function normalizeEpisodeCatalogSource(
  value: string | null,
): 'tmdb' | 'jikan' | null {
  return value === 'tmdb' || value === 'jikan' ? value : null;
}

export function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function remoteSourceLabel(provider: 'tmdb' | 'jikan'): string {
  return provider === 'tmdb' ? 'TMDB' : 'Jikan';
}

export function normalizeIdList(ids: readonly string[] | undefined): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string') {
      continue;
    }

    const cleaned = id.trim();
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}

export function orderForEpisodeAssignment(
  items: MediaItem[],
  mode: 'filename-asc' | 'existing-episode' | 'as-provided',
): MediaItem[] {
  if (mode === 'as-provided') {
    return [...items];
  }

  if (mode === 'existing-episode') {
    return [...items].sort((left, right) => {
      const leftSeason = left.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      const rightSeason = right.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      if (leftSeason !== rightSeason) {
        return leftSeason - rightSeason;
      }

      const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (leftEpisode !== rightEpisode) {
        return leftEpisode - rightEpisode;
      }

      return left.relativePath.localeCompare(right.relativePath, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  return [...items].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}
