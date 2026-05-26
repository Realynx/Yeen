import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import {
  buildBecauseYouWatchedRow,
  consolidateShowSearchResults,
  isEpisodeEntry,
  seededHash,
  shouldReplaceTagRowRepresentative,
  toFeaturedDedupKey,
  toProgressMap,
  toRandomizedItems,
  toRandomShowRepresentative,
  toRepresentativeTimestamp,
  toTagRowMediaKey,
  type TaggedMovieRow,
} from './homePageUtils';
import { buildHomeTaggedMovieRows } from './homeTaggedRows';
import { buildContinueWatchingEntries, type ContinueWatchingEntry } from './continueWatching';

export type HomeFeedExperience = 'desktop' | 'phone' | 'tv';

export interface HomeCurationFeed {
  progressMap: Map<string, ProgressEntry>;
  catalogItems: MediaItem[];
  continueWatching: ContinueWatchingEntry[];
  featuredItems: MediaItem[];
  recentItems: MediaItem[];
  discoverItems: MediaItem[];
  becauseYouWatchedItems: MediaItem[];
  taggedRows: TaggedMovieRow[];
  randomDetailsCandidates: MediaItem[];
}

interface BuildHomeCurationFeedArgs {
  mediaItems: readonly MediaItem[];
  progressItems: readonly ProgressEntry[];
  dismissedContinueWatchingIds: ReadonlySet<string>;
  randomSeed: number;
  experience: HomeFeedExperience;
}

export function buildHomeCurationFeed({
  mediaItems,
  progressItems,
  dismissedContinueWatchingIds,
  randomSeed,
  experience,
}: BuildHomeCurationFeedArgs): HomeCurationFeed {
  const progressMap = toProgressMap([...progressItems]);
  const catalogItems = consolidateShowSearchResults([...mediaItems])
    .filter((item) => item.digitalMediaType === 'video');
  const limits = toHomeFeedLimits(experience);

  return {
    progressMap,
    catalogItems,
    continueWatching: buildContinueWatchingEntries(
      mediaItems.filter((item) => item.digitalMediaType === 'video'),
      progressMap,
      dismissedContinueWatchingIds,
      { limit: limits.continueWatching },
    ),
    featuredItems: buildFeaturedItems(catalogItems, progressMap, randomSeed),
    recentItems: buildRecentItems(catalogItems, limits.recent),
    discoverItems: buildDiscoverItems(catalogItems, progressMap, randomSeed, limits.discover),
    becauseYouWatchedItems: buildBecauseYouWatchedRow(catalogItems, progressMap, randomSeed),
    taggedRows: buildHomeTaggedMovieRows([...mediaItems], randomSeed, {
      rowLimit: experience === 'phone' ? 6 : undefined,
      minItems: experience === 'phone' ? 3 : undefined,
    }),
    randomDetailsCandidates: buildRandomDetailsCandidates(mediaItems, progressMap),
  };
}

function toHomeFeedLimits(experience: HomeFeedExperience) {
  if (experience === 'phone') {
    return { continueWatching: 8, recent: 12, discover: 12 };
  }

  return { continueWatching: 18, recent: 18, discover: 18 };
}

function buildFeaturedItems(
  catalogItems: readonly MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
  randomSeed: number,
): MediaItem[] {
  const randomizedCatalog = toRandomizedItems([...catalogItems], randomSeed ^ 0x51ed270b);
  const preferred = randomizedCatalog.filter((item) => !progressMap.get(item.id)?.completed);
  const candidates = preferred.length > 0 ? preferred : randomizedCatalog;
  const featured: MediaItem[] = [];
  const seenFeaturedKeys = new Set<string>();

  for (const item of candidates) {
    const dedupeKey = toFeaturedDedupKey(item);
    if (seenFeaturedKeys.has(dedupeKey)) {
      continue;
    }

    seenFeaturedKeys.add(dedupeKey);
    featured.push(item);

    if (featured.length >= 5) {
      break;
    }
  }

  return featured;
}

function buildRecentItems(catalogItems: readonly MediaItem[], limit: number): MediaItem[] {
  return [...catalogItems]
    .sort((left, right) => {
      const timestampDelta = toRepresentativeTimestamp(right) - toRepresentativeTimestamp(left);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    })
    .slice(0, limit);
}

function buildDiscoverItems(
  catalogItems: readonly MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
  randomSeed: number,
  limit: number,
): MediaItem[] {
  const seenMediaKeys = new Set<string>();
  for (const item of catalogItems) {
    const progress = progressMap.get(item.id);
    if (progress && (progress.completed || progress.positionSeconds > 0)) {
      seenMediaKeys.add(toTagRowMediaKey(item));
    }
  }

  const unseenByMediaKey = new Map<string, MediaItem>();
  for (const item of catalogItems) {
    const mediaKey = toTagRowMediaKey(item);
    if (seenMediaKeys.has(mediaKey)) {
      continue;
    }

    const existing = unseenByMediaKey.get(mediaKey);
    if (!existing || shouldReplaceTagRowRepresentative(existing, item)) {
      unseenByMediaKey.set(mediaKey, item);
    }
  }

  return toRandomizedItems(
    [...unseenByMediaKey.values()],
    seededHash(`${randomSeed}:discover`),
  ).slice(0, limit);
}

function buildRandomDetailsCandidates(
  mediaItems: readonly MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
): MediaItem[] {
  const directCandidates: MediaItem[] = [];
  const showGroups = new Map<string, MediaItem[]>();

  for (const item of mediaItems) {
    if (item.digitalMediaType !== 'video') {
      continue;
    }

    if (item.type === 'show' || isEpisodeEntry(item)) {
      const showKey = normalizeShowKey(item);
      if (showKey) {
        const existing = showGroups.get(showKey);
        if (existing) {
          existing.push(item);
        } else {
          showGroups.set(showKey, [item]);
        }
        continue;
      }
    }

    directCandidates.push(item);
  }

  const showRepresentatives = [...showGroups.values()].map((items) =>
    toRandomShowRepresentative(items, progressMap),
  );

  return [...directCandidates, ...showRepresentatives];
}
