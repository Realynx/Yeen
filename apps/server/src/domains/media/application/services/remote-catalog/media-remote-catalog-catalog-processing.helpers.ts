import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { TmdbRemoteCandidate } from '../remote-metadata/tmdb-metadata.service';
import type { JikanRemoteCandidate } from '../remote-metadata/jikan-metadata.service';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

export function processCandidatesForCatalogValue(
  allCandidates: RemoteMediaCandidate[],
  requestedTags: readonly string[],
  isTagExploreMode: boolean,
  localTitleIndex: Map<string, Set<number | null>>,
  hasUsefulCandidateFn: (candidate: RemoteMediaCandidate) => boolean,
  matchesTagFiltersFn: (
    candidate: RemoteMediaCandidate,
    tags: readonly string[],
  ) => boolean,
  isAlreadyIndexedFn: (
    candidate: RemoteMediaCandidate,
    index: Map<string, Set<number | null>>,
  ) => boolean,
  dedupKeyFn: (candidate: RemoteMediaCandidate) => string,
  scoreFn: (candidate: RemoteMediaCandidate) => number,
): RemoteMediaCandidate[] {
  const deduped = new Map<string, RemoteMediaCandidate>();

  for (const candidate of allCandidates) {
    if (!hasUsefulCandidateFn(candidate)) {
      continue;
    }

    if (!matchesTagFiltersFn(candidate, requestedTags)) {
      continue;
    }

    if (!isTagExploreMode && isAlreadyIndexedFn(candidate, localTitleIndex)) {
      continue;
    }

    const key = dedupKeyFn(candidate);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, candidate);
      continue;
    }

    if (scoreFn(candidate) > scoreFn(existing)) {
      deduped.set(key, candidate);
    }
  }

  const sorted = [...deduped.values()].sort((left, right) => {
    const scoreDelta = scoreFn(right) - scoreFn(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.title.localeCompare(right.title, undefined, {
      sensitivity: 'base',
    });
  });

  return sorted;
}

export function sliceAndConvertCandidatesValue(
  candidates: RemoteMediaCandidate[],
  sliceOffset: number,
  sliceLimit: number,
  toMediaItemFn: (candidate: RemoteMediaCandidate) => MediaItem,
): MediaItem[] {
  const sliced = candidates.slice(sliceOffset, sliceOffset + sliceLimit);
  return sliced.map((candidate) => toMediaItemFn(candidate));
}
