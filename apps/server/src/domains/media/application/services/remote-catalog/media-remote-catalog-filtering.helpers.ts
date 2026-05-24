import type { TmdbRemoteCandidate } from '../remote-metadata/tmdb-metadata.service';
import type { JikanRemoteCandidate } from '../remote-metadata/jikan-metadata.service';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

export function normalizeTagFiltersValue(tags?: string[]): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const normalized = new Set<string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') {
      continue;
    }

    const splitValues = rawTag.split(',');
    for (const splitValue of splitValues) {
      const cleaned = splitValue.trim().toLowerCase();
      if (cleaned) {
        normalized.add(cleaned);
      }
    }
  }

  return [...normalized];
}

export type RemoteMediaProvider = 'tmdb' | 'jikan';

export function normalizeRemoteProvidersValue(
  providers: readonly RemoteMediaProvider[] | undefined,
): RemoteMediaProvider[] {
  if (!Array.isArray(providers) || providers.length === 0) {
    return ['tmdb', 'jikan'];
  }

  const deduped = new Set<RemoteMediaProvider>();
  for (const provider of providers) {
    if (typeof provider !== 'string') {
      continue;
    }

    if (provider === 'tmdb' || provider === 'jikan') {
      deduped.add(provider);
    }
  }

  return deduped.size > 0 ? [...deduped] : ['tmdb', 'jikan'];
}

export function matchesRemoteTagFiltersValue(
  candidate: RemoteMediaCandidate,
  requestedTags: readonly string[],
): boolean {
  if (requestedTags.length === 0) {
    return true;
  }

  const candidateTags = toNormalizedTagSetValue(candidate.tags);
  if (candidateTags.size === 0) {
    return false;
  }

  return requestedTags.some((tag) => candidateTags.has(tag));
}

export function hasUsefulRemoteCandidateValue(
  candidate: RemoteMediaCandidate,
): boolean {
  const title = candidate.title.trim();
  if (!title) {
    return false;
  }

  if (candidate.mediaType !== 'movie' && candidate.mediaType !== 'show') {
    return false;
  }

  return true;
}

export function toNormalizedTagSetValue(
  tags: readonly string[] | null | undefined,
): Set<string> {
  const normalized = new Set<string>();

  if (!Array.isArray(tags) || tags.length === 0) {
    return normalized;
  }

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim().toLowerCase();
    if (cleaned) {
      normalized.add(cleaned);
    }
  }

  return normalized;
}

export function remoteCandidateScoreValue(candidate: RemoteMediaCandidate): number {
  let score = 0;

  if (candidate.posterUrl) {
    score += 4;
  }
  if (candidate.backdropUrl) {
    score += 3;
  }
  if (candidate.overview) {
    score += 2;
  }
  if (candidate.releaseYear) {
    score += 1;
  }
  if (candidate.runtimeSeconds && candidate.runtimeSeconds > 0) {
    score += 1;
  }
  if (candidate.provider === 'tmdb') {
    score += 0.25;
  }

  return score;
}
