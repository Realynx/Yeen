import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MediaRow } from '../components/MediaRow';
import { MediaTile } from '../components/MediaTile';
import {
  listMedia,
  listProgress,
  toApiErrorMessage,
} from '../lib/api';
import type { MediaItem, ProgressEntry, User } from '../lib/types';
import {
  artworkUrlForMedia,
  consolidateShowSearchResults,
  isEpisodeEntry,
  MAX_TAG_ROW_ITEMS,
  MIN_TAG_ROW_ITEMS,
  normalizeHomeMovieTagKey,
  normalizeTags,
  seededHash,
  shouldReplaceTagRowRepresentative,
  toFeaturedDedupKey,
  toHomeMovieTagLabel,
  toProgressMap,
  toProgressPercent,
  toRandomizedItems,
  toRandomShowRepresentative,
  toRepresentativeTimestamp,
  toSeasonEpisodeLabel,
  toTagRowMediaKey,
  toTagSlug,
} from './home/homePageUtils';
import { HomeFeaturedHero } from './home/HomeFeaturedHero';
import { HomeMediaShelfRow } from './home/HomeMediaShelfRow';
import { HomeTopNav } from './home/HomeTopNav';
import type { TaggedMovieRow } from './home/homePageUtils';
import { toLibrarySearchPath } from './librarySearchUtils';
import { normalizeShowKey } from './media-details/mediaDetailsUtils';

interface HomePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function HomePage({ token, user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);
  const openPlayer = useCallback((mediaId: string) => {
    navigate(`/player/${mediaId}`);
  }, [navigate]);

  const [query, setQuery] = useState('');
  const [randomRowSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [media, progress] = await Promise.all([
        listMedia(token),
        listProgress(token),
      ]);
      setMediaItems(media);
      setProgressItems(progress);
    } catch (loadError) {
      setError(toApiErrorMessage(loadError, 'Failed to load media library.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    async function refreshLibrary() {
      try {
        const [media, progress] = await Promise.all([
          listMedia(token),
          listProgress(token),
        ]);

        if (cancelled) {
          return;
        }

        setMediaItems(media);
        setProgressItems(progress);
        setError(null);
      } catch {
        // Keep showing existing results if a background refresh fails.
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshLibrary();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

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
    const rows = new Map<
      string,
      {
        key: string;
        label: string;
        itemByMediaKey: Map<string, MediaItem>;
      }
    >();

    for (const item of mediaItems) {
      if (item.digitalMediaType !== 'video') {
        continue;
      }

      const tags = normalizeTags(item.tags);
      for (const tag of tags) {
        const key = normalizeHomeMovieTagKey(tag);
        const label = toHomeMovieTagLabel(tag);
        const mediaKey = toTagRowMediaKey(item);
        const existing = rows.get(key);

        if (!existing) {
          rows.set(key, {
            key,
            label,
            itemByMediaKey: new Map<string, MediaItem>([[mediaKey, item]]),
          });
          continue;
        }

        const existingItem = existing.itemByMediaKey.get(mediaKey);
        if (!existingItem) {
          existing.itemByMediaKey.set(mediaKey, item);
          continue;
        }

        if (shouldReplaceTagRowRepresentative(existingItem, item)) {
          existing.itemByMediaKey.set(mediaKey, item);
        }
      }
    }

    const orderedRows = [...rows.values()].sort((left, right) => {
      if (right.itemByMediaKey.size !== left.itemByMediaKey.size) {
        return right.itemByMediaKey.size - left.itemByMediaKey.size;
      }

      return left.label.localeCompare(right.label, undefined, {
        sensitivity: 'base',
      });
    });

    const usedTagRowMediaKeys = new Set<string>();
    const builtRows: TaggedMovieRow[] = [];

    for (const row of orderedRows) {
      const randomizedItems = toRandomizedItems(
        [...row.itemByMediaKey.values()],
        seededHash(`${randomRowSeed}:tag:${row.key}`),
      );

      const rowItems: MediaItem[] = [];
      for (const item of randomizedItems) {
        const mediaKey = toTagRowMediaKey(item);
        if (usedTagRowMediaKeys.has(mediaKey)) {
          continue;
        }

        usedTagRowMediaKeys.add(mediaKey);
        rowItems.push(item);

        if (rowItems.length >= MAX_TAG_ROW_ITEMS) {
          break;
        }
      }

      if (rowItems.length < MIN_TAG_ROW_ITEMS) {
        continue;
      }

      builtRows.push({
        id: `row-tag-${toTagSlug(row.label)}`,
        label: row.label,
        items: rowItems,
      });
    }

    return builtRows;
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

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Loading your media shelf...</p> : null}

      {hasContinueWatching ? (
        <section className="browse-section is-first-row" id="row-continue">
          <h2 className="section-title">Continue Watching for {firstName}</h2>
          <MediaRow>
            {continueWatching.map(({ item, percent }) => (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={percent}
                topRightLabel={toSeasonEpisodeLabel(item)}
                onOpen={openPlayer}
              />
            ))}
          </MediaRow>
        </section>
      ) : null}

      <HomeMediaShelfRow
        className={hasContinueWatching ? 'browse-section' : 'browse-section is-first-row'}
        id="row-new"
        title="New on Yeen"
        items={recentItems}
        progressMap={progressMap}
        onOpen={openDetails}
      />

      {discoverItems.length > 0 ? (
        <HomeMediaShelfRow
          className="browse-section"
          id="row-discover"
          title="Discover"
          items={discoverItems}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ) : null}

      {movieRowsByTag.map((row) => (
        <HomeMediaShelfRow
          key={row.id}
          className="browse-section"
          id={row.id}
          title={row.label}
          items={row.items}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ))}

      <footer className="home-footer" aria-label="Home page footer">
        <div className="home-footer-links">
          <NavLink className="home-footer-link" to="/library">
            Library
          </NavLink>
          <NavLink className="home-footer-link" to="/explore">
            Explore
          </NavLink>
          <NavLink className="home-footer-link" to="/settings">
            Settings
          </NavLink>
        </div>
        <p className="home-footer-copy">Your personal streaming shelf, organized your way.</p>
      </footer>
    </main>
  );
}
