import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem, User } from '../../shared/services/types';
import { useMediaStorageSummary } from '../../library/services/useMediaStorageSummary';
import {
  artworkUrlForMedia,
  consolidateShowSearchResults,
  isEpisodeEntry,
  seededHash,
  shouldReplaceTagRowRepresentative,
  toFeaturedDedupKey,
  toProgressMap,
  toProgressPercent,
  toRandomizedItems,
  toRandomShowRepresentative,
  toRepresentativeTimestamp,
  toTagRowMediaKey,
} from '../services/homePageUtils';
import { buildHomeTaggedMovieRows } from '../services/homeTaggedRows';
import { HomeFeaturedHero } from '../components/HomeFeaturedHero';
import { HomeContinueWatchingSection } from '../components/HomeContinueWatchingSection';
import { HomeDiscoverSections } from '../components/HomeDiscoverSections';
import { HomeFooter } from '../components/HomeFooter';
import { HomeLoadingSkeleton } from '../components/HomeLoadingSkeleton';
import { HomeMediaShelfRow } from '../components/HomeMediaShelfRow';
import { HomeTopNav } from '../components/HomeTopNav';
import { toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import { useHomeFeed } from '../services/useHomeFeed';

interface HomePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function HomePage({ token, user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const {
    summary: storageSummary,
    loading: storageSummaryLoading,
    error: storageSummaryError,
  } = useMediaStorageSummary(token);

  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);
  const openPlayer = useCallback((mediaId: string) => {
    navigate(`/player/${mediaId}`);
  }, [navigate]);

  const [query, setQuery] = useState('');
  const [randomRowSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const { mediaItems, progressItems, loading, error } = useHomeFeed(token, {
    initialErrorMessage: 'Failed to load media library.',
    refreshIntervalMs: 5000,
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const progressMap = useMemo(() => toProgressMap(progressItems), [progressItems]);

  const continueWatching = useMemo(() => {
    return mediaItems
      .map((item) => {
        const progress = progressMap.get(item.id);
        const percent = toProgressPercent(progress);
        if (!progress || progress.completed || typeof percent !== 'number') {
          return null;
        }

        const updatedAtMs = Date.parse(progress.updatedAt);

        return {
          item,
          percent,
          lastWatchedAt: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
        };
      })
      .filter(
        (entry): entry is { item: MediaItem; percent: number; lastWatchedAt: number } => !!entry,
      )
      .sort((left, right) => {
        if (right.lastWatchedAt !== left.lastWatchedAt) {
          return right.lastWatchedAt - left.lastWatchedAt;
        }

        return left.item.title.localeCompare(right.item.title, undefined, {
          sensitivity: 'base',
        });
      });
  }, [mediaItems, progressMap]);

  const hasContinueWatching = continueWatching.length > 0;

  const catalogRowItems = useMemo(() => {
    return consolidateShowSearchResults(mediaItems);
  }, [mediaItems]);

  const recentItems = useMemo(() => {
    return [...catalogRowItems]
      .sort((left, right) => {
        const timestampDelta =
          toRepresentativeTimestamp(right) - toRepresentativeTimestamp(left);
        if (timestampDelta !== 0) {
          return timestampDelta;
        }

        return left.title.localeCompare(right.title, undefined, {
          sensitivity: 'base',
        });
      })
      .slice(0, 18);
  }, [catalogRowItems]);

  const discoverItems = useMemo(() => {
    const seenMediaKeys = new Set<string>();

    for (const item of mediaItems) {
      const progress = progressMap.get(item.id);
      if (!progress) {
        continue;
      }

      if (!progress.completed && progress.positionSeconds <= 0) {
        continue;
      }

      seenMediaKeys.add(toTagRowMediaKey(item));
    }

    const unseenByMediaKey = new Map<string, MediaItem>();

    for (const item of catalogRowItems) {
      if (item.digitalMediaType !== 'video') {
        continue;
      }

      const mediaKey = toTagRowMediaKey(item);
      if (seenMediaKeys.has(mediaKey)) {
        continue;
      }

      const existing = unseenByMediaKey.get(mediaKey);
      if (!existing) {
        unseenByMediaKey.set(mediaKey, item);
        continue;
      }

      if (shouldReplaceTagRowRepresentative(existing, item)) {
        unseenByMediaKey.set(mediaKey, item);
      }
    }

    const unseenCandidates = [...unseenByMediaKey.values()];

    return toRandomizedItems(
      unseenCandidates,
      seededHash(`${randomRowSeed}:discover`),
    ).slice(0, 18);
  }, [catalogRowItems, mediaItems, progressMap, randomRowSeed]);

  const featuredItems = useMemo(() => {
    const featured: MediaItem[] = [];
    const seenFeaturedKeys = new Set<string>();

    const randomizedCatalog = toRandomizedItems(
      catalogRowItems,
      randomRowSeed ^ 0x51ed270b,
    );

    for (const item of randomizedCatalog) {
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
  }, [catalogRowItems, randomRowSeed]);

  const activeFeaturedIndex = featuredItems.length > 0
    ? ((featuredIndex % featuredItems.length) + featuredItems.length) % featuredItems.length
    : 0;

  const featuredItem = featuredItems[activeFeaturedIndex] ?? null;

  const showNextFeatured = useCallback(() => {
    setFeaturedIndex((current) => {
      if (featuredItems.length <= 1) {
        return current;
      }

      return (current + 1) % featuredItems.length;
    });
  }, [featuredItems.length]);

  const showPreviousFeatured = useCallback(() => {
    setFeaturedIndex((current) => {
      if (featuredItems.length <= 1) {
        return current;
      }

      return (current - 1 + featuredItems.length) % featuredItems.length;
    });
  }, [featuredItems.length]);

  useEffect(() => {
    if (featuredItems.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      showNextFeatured();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [featuredItems.length, showNextFeatured]);

  const movieRowsByTag = useMemo(() => {
    return buildHomeTaggedMovieRows(mediaItems, randomRowSeed);
  }, [mediaItems, randomRowSeed]);

  const featuredDescription = useMemo(() => {
    if (!featuredItem) {
      return 'Open settings and run a media scan to begin building your home shelf.';
    }

    if (featuredItem.description?.trim()) {
      return featuredItem.description;
    }

    const typeLabel = featuredItem.type === 'movie'
      ? 'Movie'
      : featuredItem.type === 'show'
        ? 'Series'
        : 'Media';

    return `${typeLabel} from ${featuredItem.relativePath}`;
  }, [featuredItem]);

  const heroBackgroundImage = useMemo(() => {
    if (!featuredItem) {
      return null;
    }

    return artworkUrlForMedia(featuredItem);
  }, [featuredItem]);

  const firstName = useMemo(() => {
    const name = user.name.trim().split(/\s+/)[0] ?? '';
    return name || 'you';
  }, [user.name]);

  const featuredProgress = featuredItem
    ? progressMap.get(featuredItem.id)
    : undefined;

  const featuredPercent = toProgressPercent(featuredProgress);

  const randomDetailsCandidates = useMemo(() => {
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
  }, [mediaItems, progressMap]);

  const hasRandomDetailsCandidate = randomDetailsCandidates.length > 0;
  const showInitialHomeSkeleton = loading;

  const openRandomDetails = useCallback(() => {
    if (randomDetailsCandidates.length === 0) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * randomDetailsCandidates.length);
    openDetails(randomDetailsCandidates[randomIndex].id);
  }, [openDetails, randomDetailsCandidates]);

  return (
    <main className="browse-page home-page">
      <HomeTopNav
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={handleSearch}
        onOpenRandomDetails={openRandomDetails}
        hasRandomDetailsCandidate={hasRandomDetailsCandidate}
        user={user}
        onLogout={onLogout}
      />

      {error ? <p className="error-text">{error}</p> : null}
      {showInitialHomeSkeleton ? (
        <HomeLoadingSkeleton />
      ) : (
        <>
          <HomeFeaturedHero
            heroBackgroundImage={heroBackgroundImage}
            featuredItems={featuredItems}
            featuredItem={featuredItem}
            activeFeaturedIndex={activeFeaturedIndex}
            featuredDescription={featuredDescription}
            featuredPercent={featuredPercent}
            onShowPrevious={showPreviousFeatured}
            onShowNext={showNextFeatured}
            onSelectFeatured={setFeaturedIndex}
            onPlay={openPlayer}
            onOpenDetails={openDetails}
            onManageLibrary={() => navigate('/settings')}
          />

          {hasContinueWatching ? (
            <HomeContinueWatchingSection
              firstName={firstName}
              continueWatching={continueWatching}
              onOpenPlayer={openPlayer}
            />
          ) : null}

          <HomeMediaShelfRow
            className={hasContinueWatching ? 'browse-section' : 'browse-section is-first-row'}
            id="row-new"
            title="New on Yeen"
            items={recentItems}
            progressMap={progressMap}
            onOpen={openDetails}
          />

          <HomeDiscoverSections
            discoverItems={discoverItems}
            movieRowsByTag={movieRowsByTag}
            progressMap={progressMap}
            onOpenDetails={openDetails}
          />
        </>
      )}

      <HomeFooter
        storageSummary={storageSummary}
        storageSummaryLoading={storageSummaryLoading}
        storageSummaryError={storageSummaryError}
      />
    </main>
  );
}
