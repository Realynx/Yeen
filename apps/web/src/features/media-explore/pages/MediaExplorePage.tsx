import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import type { User } from '../../shared/services/types';
import { pickRandomItem, toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import { MediaExploreControls } from '../components/MediaExploreControls';
import { MediaExploreResults } from '../components/MediaExploreResults';
import {
  EXPECTED_TAGS_BY_MODE,
  providerLabelForMode,
  QUICK_TAGS_BY_MODE,
  type ExploreCatalogMode,
} from '../services/exploreCatalog';
import {
  getExploreTypeCounts,
  getExploreVirtualizedRange,
  getFilteredExploreItems,
  shouldUseCompactExploreGrid,
} from '../services/exploreGrid';
import { useExploreCatalogState } from '../services/useExploreCatalogState';

interface MediaExplorePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

const REMOTE_PAGE_SIZE = 20;

export function MediaExplorePage({ token, user, onLogout }: MediaExplorePageProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const {
    initialScrollTop,
    catalogMode,
    setCatalogMode,
    tagFilter,
    setTagFilter,
    typeFilter,
    setTypeFilter,
    remoteItems,
    setPage,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollTop,
    setScrollTop,
    resetExploreForTag: resetBaseExploreForTag,
  } = useExploreCatalogState({
    token,
    remotePageSize: REMOTE_PAGE_SIZE,
    loadOnRestoredSession: false,
    skipInitialFetchWhenRestored: true,
    trackScrollTop: true,
    errorMessage: 'Failed to search remote media catalogs.',
  });

  const [waitingForRateLimit, setWaitingForRateLimit] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreLockedRef = useRef(false);
  const nextLoadMoreAllowedAtRef = useRef(0);
  const hasUserScrolledResultsRef = useRef(false);
  const initialAutoFillCountRef = useRef(0);
  const queuedLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(loading);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  const tagFilterRef = useRef(tagFilter);
  const catalogModeRef = useRef(catalogMode);
  const pendingScrollRestoreRef = useRef(initialScrollTop);

  const openDetails = useCallback(
    (mediaId: string) => {
      navigate(`/details/${mediaId}`);
    },
    [navigate],
  );

  const clearQueuedLoad = useCallback(() => {
    if (queuedLoadTimeoutRef.current !== null) {
      clearTimeout(queuedLoadTimeoutRef.current);
      queuedLoadTimeoutRef.current = null;
    }

    setWaitingForRateLimit(false);
  }, []);

  const queueLoadAfterCooldown = useCallback((waitMs: number) => {
    if (queuedLoadTimeoutRef.current !== null) {
      return;
    }

    setWaitingForRateLimit(true);
    queuedLoadTimeoutRef.current = setTimeout(() => {
      queuedLoadTimeoutRef.current = null;
      setWaitingForRateLimit(false);

      if (
        loadingRef.current
        || loadingMoreRef.current
        || !hasMoreRef.current
        || tagFilterRef.current.trim().length < 2
      ) {
        return;
      }

      const viewport = resultsViewportRef.current;
      if (!viewport) {
        return;
      }

      const isNearBottom =
        viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 160;
      const allowInitialAutoFill =
        !hasUserScrolledResultsRef.current
        && initialAutoFillCountRef.current < 1
        && viewport.scrollHeight <= viewport.clientHeight + 120;

      if (!isNearBottom && !allowInitialAutoFill) {
        return;
      }

      const minGapMs = catalogModeRef.current === 'anime' ? 2600 : 850;
      nextLoadMoreAllowedAtRef.current = Date.now() + minGapMs;

      if (allowInitialAutoFill) {
        initialAutoFillCountRef.current += 1;
      }

      loadMoreLockedRef.current = true;
      setPage((previous) => previous + 1);
    }, Math.max(120, waitMs + 20));
  }, [setPage]);

  const resetExploreForTag = useCallback((nextTag: string) => {
    resetBaseExploreForTag(nextTag, { resetScrollTop: true });
    clearQueuedLoad();

    loadMoreLockedRef.current = false;
    nextLoadMoreAllowedAtRef.current = 0;
    hasUserScrolledResultsRef.current = false;
    initialAutoFillCountRef.current = 0;
    pendingScrollRestoreRef.current = 0;

    const viewport = resultsViewportRef.current;
    if (viewport) {
      viewport.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [clearQueuedLoad, resetBaseExploreForTag]);

  useEffect(() => {
    loadingRef.current = loading;
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
    tagFilterRef.current = tagFilter;
    catalogModeRef.current = catalogMode;
  }, [catalogMode, hasMore, loading, loadingMore, tagFilter]);

  useEffect(() => {
    const viewport = resultsViewportRef.current;
    if (!viewport) {
      return;
    }

    if (pendingScrollRestoreRef.current > 0) {
      viewport.scrollTop = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = 0;
    }

    const handleScroll = () => {
      if (viewport.scrollTop > 24) {
        hasUserScrolledResultsRef.current = true;
      }

      setScrollTop(viewport.scrollTop);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [remoteItems.length, setScrollTop, typeFilter]);

  useEffect(() => {
    const viewport = resultsViewportRef.current;
    if (!viewport) {
      return;
    }

    const syncViewportSize = () => {
      setViewportWidth(viewport.clientWidth);
      setViewportHeight(viewport.clientHeight);
    };

    syncViewportSize();
    const observer = new ResizeObserver(() => {
      syncViewportSize();
    });
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [remoteItems.length, typeFilter]);

  useEffect(() => {
    const viewport = resultsViewportRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!viewport || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }

        if (entry.intersectionRatio < 0.2) {
          return;
        }

        if (loading || loadingMore || !hasMore || loadMoreLockedRef.current) {
          return;
        }

        if (tagFilter.trim().length < 2) {
          return;
        }

        const isNearBottom =
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 160;
        const allowInitialAutoFill =
          !hasUserScrolledResultsRef.current
          && initialAutoFillCountRef.current < 1
          && viewport.scrollHeight <= viewport.clientHeight + 120;

        if (!isNearBottom && !allowInitialAutoFill) {
          return;
        }

        const now = Date.now();
        const minGapMs = catalogMode === 'anime' ? 2600 : 850;
        if (now < nextLoadMoreAllowedAtRef.current) {
          queueLoadAfterCooldown(nextLoadMoreAllowedAtRef.current - now);
          return;
        }

        clearQueuedLoad();
        nextLoadMoreAllowedAtRef.current = now + minGapMs;

        if (allowInitialAutoFill) {
          initialAutoFillCountRef.current += 1;
        }

        loadMoreLockedRef.current = true;
        setPage((previous) => previous + 1);
      },
      {
        root: viewport,
        rootMargin: '120px 0px 120px 0px',
        threshold: 0.2,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    catalogMode,
    clearQueuedLoad,
    hasMore,
    loading,
    loadingMore,
    queueLoadAfterCooldown,
    remoteItems.length,
    setPage,
    tagFilter,
    typeFilter,
  ]);

  useEffect(() => {
    return () => {
      clearQueuedLoad();
    };
  }, [clearQueuedLoad]);

  const selectableTags = useMemo(() => {
    return [...EXPECTED_TAGS_BY_MODE[catalogMode]];
  }, [catalogMode]);

  const typeCounts = useMemo(() => {
    return getExploreTypeCounts(remoteItems);
  }, [remoteItems]);

  const filteredItems = useMemo(() => {
    return getFilteredExploreItems(remoteItems, typeFilter);
  }, [remoteItems, typeFilter]);

  const randomDetailsCandidates = useMemo(
    () => filteredItems,
    [filteredItems],
  );

  const useCompactResultsGrid = shouldUseCompactExploreGrid(filteredItems);

  const virtualizedRange = useMemo(() => {
    return getExploreVirtualizedRange({
      filteredItems,
      useCompactResultsGrid,
      scrollTop,
      viewportHeight,
      viewportWidth,
    });
  }, [filteredItems, scrollTop, useCompactResultsGrid, viewportHeight, viewportWidth]);

  const sectionTitle =
    catalogMode === 'anime' ? 'Anime Explorer' : 'Movie & TV Explorer';

  const sectionSubtitle = tagFilter
    ? `Showing results from ${providerLabelForMode(catalogMode)} tagged "${tagFilter}".`
    : `Choose a tag to browse ${providerLabelForMode(catalogMode)} titles.`;

  const loadingMoreLabel =
    waitingForRateLimit
      ? 'Waiting for rate limit window...'
      : catalogMode === 'anime'
      ? 'Loading more anime from Jikan...'
      : 'Loading more titles...';

  const showLoadingMoreIndicator = loadingMore || waitingForRateLimit;

  function handleModeChange(nextMode: ExploreCatalogMode) {
    if (nextMode === catalogMode) {
      return;
    }

    const nextTag = QUICK_TAGS_BY_MODE[nextMode][0] ?? '';
    setCatalogMode(nextMode);
    setTypeFilter('all');
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }

  function applyQuickTag(tag: string) {
    const cleanedTag = tag.trim();
    if (cleanedTag.length < 2) {
      return;
    }

    setTagFilter(cleanedTag);
    setTypeFilter('all');
    resetExploreForTag(cleanedTag);
  }

  function handleTagSelect(nextTag: string) {
    setTagFilter(nextTag);
    setTypeFilter('all');
    resetExploreForTag(nextTag);
  }

  function handleClearTag() {
    setTagFilter('');
    setTypeFilter('all');
    resetExploreForTag('');
  }

  function resetExploreFilters() {
    const nextTag = QUICK_TAGS_BY_MODE[catalogMode][0] ?? '';
    setTypeFilter('all');
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(randomDetailsCandidates);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [openDetails, randomDetailsCandidates]);

  return (
    <main className="browse-page media-library-page media-explore-page">
      <header className="top-nav">
        <div className="top-nav-left">
          <p className="brand-mark">YEEN</p>
          <nav className="browse-links" aria-label="Browse">
            <NavLink
              className={({ isActive }) =>
                isActive ? 'browse-link active' : 'browse-link'
              }
              end
              to="/"
            >
              Home
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'browse-link active' : 'browse-link'
              }
              to="/library"
            >
              Library
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'browse-link active' : 'browse-link'
              }
              to="/explore"
            >
              Explore
            </NavLink>
          </nav>
        </div>

        <div className="top-nav-right">
          <LibrarySearchForm
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearch}
            placeholder="Search titles and paths"
            onOpenRandomDetails={openRandomDetails}
            randomDisabled={randomDetailsCandidates.length === 0}
          />
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <MediaExploreControls
        catalogMode={catalogMode}
        typeFilter={typeFilter}
        typeCounts={typeCounts}
        tagFilter={tagFilter}
        filteredCount={filteredItems.length}
        selectableTags={selectableTags}
        quickTags={QUICK_TAGS_BY_MODE[catalogMode]}
        onModeChange={handleModeChange}
        onTypeFilterChange={setTypeFilter}
        onTagSelect={handleTagSelect}
        onQuickTag={applyQuickTag}
        onClearTag={handleClearTag}
        onResetExplore={resetExploreFilters}
      />

      <MediaExploreResults
        sectionTitle={sectionTitle}
        sectionSubtitle={sectionSubtitle}
        error={error}
        loading={loading}
        filteredItems={filteredItems}
        useCompactResultsGrid={useCompactResultsGrid}
        virtualizedRange={virtualizedRange}
        resultsViewportRef={resultsViewportRef}
        loadMoreSentinelRef={loadMoreSentinelRef}
        showLoadingMoreIndicator={showLoadingMoreIndicator}
        loadingMoreLabel={loadingMoreLabel}
        waitingForRateLimit={waitingForRateLimit}
        tagFilter={tagFilter}
        hasMore={hasMore}
        onOpenDetails={openDetails}
      />
    </main>
  );
}
