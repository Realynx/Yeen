import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MediaRow } from '../components/MediaRow';
import { MediaTile } from '../components/MediaTile';
import { ProfileMenu } from '../components/ProfileMenu';
import {
  listMedia,
  listProgress,
  mediaBackdropImageUrl,
  mediaPreviewImageUrl,
  toApiErrorMessage,
} from '../lib/api';
import type { MediaItem, ProgressEntry, User } from '../lib/types';
import { normalizeShowKey } from './media-details/mediaDetailsUtils';

interface HomePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

function formatDuration(seconds: number): string {
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

function toQualityLabel(item: MediaItem): string {
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

function toProgressMap(entries: ProgressEntry[]) {
  const map = new Map<string, ProgressEntry>();
  for (const entry of entries) {
    map.set(entry.mediaId, entry);
  }
  return map;
}

function toProgressPercent(entry: ProgressEntry | undefined): number | undefined {
  if (!entry) {
    return undefined;
  }

  return (entry.positionSeconds / Math.max(entry.durationSeconds, 1)) * 100;
}

function isHttpUrl(value: string | null | undefined): value is string {
  return value?.startsWith('http://') || value?.startsWith('https://') || false;
}

function toEpisodeSortValue(item: MediaItem): number {
  const season = item.seasonNumber ?? Number.MAX_SAFE_INTEGER;
  const episode = item.episodeNumber ?? Number.MAX_SAFE_INTEGER;
  return (season * 10_000) + episode;
}

function isEpisodeEntry(item: MediaItem): boolean {
  return (
    typeof item.seasonNumber === 'number'
    || typeof item.episodeNumber === 'number'
  );
}

function shouldReplaceShowRepresentative(
  existing: MediaItem,
  candidate: MediaItem,
): boolean {
  const existingIsEpisode = isEpisodeEntry(existing);
  const candidateIsEpisode = isEpisodeEntry(candidate);

  // Prefer a series-level record over a specific episode when both exist.
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

function consolidateShowSearchResults(items: MediaItem[]): MediaItem[] {
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

function seededHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function toRandomizedItems(items: MediaItem[], seed: number): MediaItem[] {
  return [...items].sort((left, right) => {
    const leftScore = seededHash(`${seed}:${left.id}`);
    const rightScore = seededHash(`${seed}:${right.id}`);
    return leftScore - rightScore;
  });
}

function normalizeTags(tags: readonly string[] | null | undefined): string[] {
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

function toTagSlug(tag: string): string {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'untagged';
}

interface TaggedMovieRow {
  id: string;
  label: string;
  items: MediaItem[];
}

export function HomePage({ token, user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);
  const openPlayer = useCallback((mediaId: string) => {
    navigate(`/player/${mediaId}`);
  }, [navigate]);

  const artworkUrlForMedia = useCallback((item: MediaItem) => {
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
  }, []);

  const [query, setQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState<string | undefined>(
    undefined,
  );
  const [randomRowSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    const normalizedSearch = search?.trim();
    const searchValue = normalizedSearch ? normalizedSearch : undefined;

    setLoading(true);
    setError(null);

    try {
      const [media, progress] = await Promise.all([
        listMedia(token, searchValue),
        listProgress(token),
      ]);
      setMediaItems(
        searchValue ? consolidateShowSearchResults(media) : media,
      );
      setProgressItems(progress);
      setActiveSearch(searchValue);
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
          listMedia(token, activeSearch),
          listProgress(token),
        ]);

        if (cancelled) {
          return;
        }

        setMediaItems(
          activeSearch ? consolidateShowSearchResults(media) : media,
        );
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
  }, [activeSearch, token]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(query);
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

        return {
          item,
          percent,
        };
      })
      .filter((entry): entry is { item: MediaItem; percent: number } => !!entry);
  }, [mediaItems, progressMap]);

  const catalogRowItems = useMemo(() => {
    return consolidateShowSearchResults(mediaItems);
  }, [mediaItems]);

  const recentItems = useMemo(() => {
    return catalogRowItems.slice(0, 18);
  }, [catalogRowItems]);

  const randomSelectionItems = useMemo(() => {
    return toRandomizedItems(catalogRowItems, randomRowSeed).slice(0, 18);
  }, [catalogRowItems, randomRowSeed]);

  const featuredItems = useMemo(() => {
    const featured: MediaItem[] = [];
    const seen = new Set<string>();

    for (const entry of continueWatching) {
      if (seen.has(entry.item.id)) {
        continue;
      }

      seen.add(entry.item.id);
      featured.push(entry.item);

      if (featured.length >= 5) {
        return featured;
      }
    }

    const randomizedCatalog = toRandomizedItems(
      catalogRowItems,
      randomRowSeed ^ 0x51ed270b,
    );

    for (const item of randomizedCatalog) {
      if (seen.has(item.id)) {
        continue;
      }

      seen.add(item.id);
      featured.push(item);

      if (featured.length >= 5) {
        break;
      }
    }

    return featured;
  }, [catalogRowItems, continueWatching, randomRowSeed]);

  const activeFeaturedIndex = featuredItems.length > 0
    ? ((featuredIndex % featuredItems.length) + featuredItems.length) % featuredItems.length
    : 0;

  const featuredItem = featuredItems[activeFeaturedIndex] ?? null;

  useEffect(() => {
    if (featuredItems.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredItems.length);
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [featuredItems.length]);

  const movieRowsByTag = useMemo(() => {
    const rows = new Map<
      string,
      {
        label: string;
        items: MediaItem[];
        seenIds: Set<string>;
      }
    >();

    for (const item of catalogRowItems) {
      if (item.type !== 'movie') {
        continue;
      }

      const tags = normalizeTags(item.tags);
      for (const tag of tags) {
        const key = tag.toLowerCase();
        const existing = rows.get(key);

        if (!existing) {
          rows.set(key, {
            label: tag,
            items: [item],
            seenIds: new Set([item.id]),
          });
          continue;
        }

        if (existing.seenIds.has(item.id)) {
          continue;
        }

        existing.seenIds.add(item.id);
        existing.items.push(item);
      }
    }

    return [...rows.values()]
      .sort((left, right) => {
        if (right.items.length !== left.items.length) {
          return right.items.length - left.items.length;
        }

        return left.label.localeCompare(right.label, undefined, {
          sensitivity: 'base',
        });
      })
      .map((row): TaggedMovieRow => ({
        id: `row-tag-${toTagSlug(row.label)}`,
        label: row.label,
        items: row.items.slice(0, 24),
      }));
  }, [catalogRowItems]);

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
  }, [artworkUrlForMedia, featuredItem]);

  const firstName = useMemo(() => {
    const name = user.name.trim().split(/\s+/)[0] ?? '';
    return name || 'you';
  }, [user.name]);

  const featuredProgress = featuredItem
    ? progressMap.get(featuredItem.id)
    : undefined;

  const featuredPercent = toProgressPercent(featuredProgress);

  return (
    <main className="browse-page">
      <header className="top-nav">
        <div className="top-nav-left">
          <p className="brand-mark">YEEN</p>
          <nav className="browse-links" aria-label="Browse">
            <NavLink
              className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
              end
              to="/"
            >
              Home
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
              to="/library"
            >
              Library
            </NavLink>
            <a className="browse-link" href="#row-continue">Continue Watching</a>
            <a className="browse-link" href="#row-new">New</a>
            <a className="browse-link" href="#row-random">Random</a>
            {movieRowsByTag.length > 0 ? (
              <a className="browse-link" href={`#${movieRowsByTag[0].id}`}>Tags</a>
            ) : null}
          </nav>
        </div>

        <div className="top-nav-right">
          <form className="search-row" onSubmit={handleSearch}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titles, folders, or metadata"
              aria-label="Search media"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <button type="submit">Search</button>
          </form>
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <section
        className="hero-banner"
        id="home-featured"
        style={heroBackgroundImage ? { backgroundImage: `url(${heroBackgroundImage})` } : undefined}
      >
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-content hero-content-transition" key={featuredItem?.id ?? 'featured-empty'}>
          <p className="hero-kicker">
            Featured on Yeen
            {featuredItems.length > 1 ? (
              <span className="hero-rotation-note">{`${activeFeaturedIndex + 1} / ${featuredItems.length}`}</span>
            ) : null}
          </p>
          <h1>{featuredItem ? featuredItem.title : 'No media found yet'}</h1>
          <p className="hero-description">{featuredDescription}</p>

          <div className="hero-meta-strip">
            {featuredItem?.releaseYear ? <span>{featuredItem.releaseYear}</span> : null}
            {featuredItem ? <span>{formatDuration(featuredItem.durationSeconds)}</span> : null}
            {featuredItem ? <span>{toQualityLabel(featuredItem)}</span> : null}
            {featuredItem ? <span>{featuredItem.extension.replace('.', '').toUpperCase()}</span> : null}
          </div>

          <div className="hero-actions">
            {featuredItem ? (
              <button
                className="accent-button"
                onClick={() => openPlayer(featuredItem.id)}
              >
                Play
              </button>
            ) : null}

            {featuredItem ? (
              <button
                className="ghost-button"
                onClick={() => openDetails(featuredItem.id)}
              >
                More Info
              </button>
            ) : null}

            <button className="ghost-button" onClick={() => navigate('/settings')}>
              Manage Library
            </button>
          </div>

          {typeof featuredPercent === 'number' ? (
            <p className="hero-resume">Resume point: {Math.round(featuredPercent)}%</p>
          ) : null}

          {featuredItems.length > 1 ? (
            <div className="hero-featured-switcher" role="group" aria-label="Choose featured media">
              {featuredItems.map((item, index) => {
                const isActive = index === activeFeaturedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={isActive ? 'hero-switch-dot is-active' : 'hero-switch-dot'}
                    onClick={() => setFeaturedIndex(index)}
                    aria-label={`Show featured: ${item.title}`}
                    aria-pressed={isActive}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Loading your media shelf...</p> : null}

      {continueWatching.length > 0 ? (
        <section className="browse-section" id="row-continue">
          <h2 className="section-title">Continue Watching for {firstName}</h2>
          <MediaRow>
            {continueWatching.map(({ item, percent }) => (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={percent}
                onOpen={openDetails}
              />
            ))}
          </MediaRow>
        </section>
      ) : null}

      <section className="browse-section" id="row-new">
        <h2 className="section-title">New on Yeen</h2>
        <MediaRow>
          {recentItems.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              progressPercent={toProgressPercent(progressMap.get(item.id))}
              onOpen={openDetails}
            />
          ))}
        </MediaRow>
      </section>

      <section className="browse-section" id="row-random">
        <h2 className="section-title">Random Selection</h2>
        <MediaRow>
          {randomSelectionItems.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              progressPercent={toProgressPercent(progressMap.get(item.id))}
              onOpen={openDetails}
            />
          ))}
        </MediaRow>
      </section>

      {movieRowsByTag.map((row) => (
        <section className="browse-section" id={row.id} key={row.id}>
          <h2 className="section-title">{row.label} Movies</h2>
          <MediaRow>
            {row.items.map((item) => (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={toProgressPercent(progressMap.get(item.id))}
                onOpen={openDetails}
              />
            ))}
          </MediaRow>
        </section>
      ))}
    </main>
  );
}
