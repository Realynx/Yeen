import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { TmdbRemoteCandidate } from '../remote-metadata/tmdb-metadata.service';
import type { JikanRemoteCandidate } from '../remote-metadata/jikan-metadata.service';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

export function normalizeRemoteTitleForKeyValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function remoteCandidateDedupKeyValue(
  candidate: RemoteMediaCandidate,
): string {
  const normalizedTitle = normalizeRemoteTitleForKeyValue(candidate.title);
  const year =
    typeof candidate.releaseYear === 'number' &&
    Number.isFinite(candidate.releaseYear)
      ? Math.floor(candidate.releaseYear)
      : 0;

  return `${candidate.mediaType}:${normalizedTitle}:y${year}`;
}

export function buildLocalTitleIndexValue(
  items: MediaItem[],
): Map<string, Set<number | null>> {
  const index = new Map<string, Set<number | null>>();

  for (const item of items) {
    const mediaType: 'movie' | 'show' = item.type === 'show' ? 'show' : 'movie';
    const normalizedTitle = normalizeRemoteTitleForKeyValue(item.title);
    if (!normalizedTitle) {
      continue;
    }

    const key = `${mediaType}:${normalizedTitle}`;
    const years = index.get(key) ?? new Set<number | null>();
    const year =
      typeof item.releaseYear === 'number' && Number.isFinite(item.releaseYear)
        ? Math.floor(item.releaseYear)
        : null;

    years.add(year);
    index.set(key, years);
  }

  return index;
}

export function isAlreadyIndexedLocallyValue(
  candidate: RemoteMediaCandidate,
  localTitleIndex: Map<string, Set<number | null>>,
): boolean {
  const normalizedTitle = normalizeRemoteTitleForKeyValue(candidate.title);
  if (!normalizedTitle) {
    return false;
  }

  const titleKey = `${candidate.mediaType}:${normalizedTitle}`;
  const knownYears = localTitleIndex.get(titleKey);
  if (!knownYears || knownYears.size === 0) {
    return false;
  }

  const candidateYear =
    typeof candidate.releaseYear === 'number' &&
    Number.isFinite(candidate.releaseYear)
      ? Math.floor(candidate.releaseYear)
      : null;

  if (knownYears.has(candidateYear)) {
    return true;
  }

  if (candidateYear === null || knownYears.has(null)) {
    return true;
  }

  return false;
}
