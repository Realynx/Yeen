import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { pickRandomItem, toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import { MediaExploreControls } from '../components/MediaExploreControls';
import { MediaExploreResults } from '../components/MediaExploreResults';
import { ExploreTopNav } from '../components/ExploreTopNav';
import {
  EXPECTED_TAGS_BY_MODE,
  providerLabelForMode,
  QUICK_TAGS_BY_MODE,
} from '../services/exploreCatalog';
import {
  getExploreTypeCounts,
  getExploreVirtualizedRange,
  getFilteredExploreItems,
  shouldUseCompactExploreGrid,
} from '../services/exploreGrid';
import { useExploreFilterActions } from '../services/useExploreFilterActions';
import { useExploreCatalogState } from '../services/useExploreCatalogState';
import { useClientExperience } from '../../navigation/services/clientExperience';

interface MediaExplorePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

const REMOTE_PAGE_SIZE = 20;

export function MediaExplorePage({ token, user, onLogout }: MediaExplorePageProps) {
  const experience = useClientExperience();
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

  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);

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

  useEffect(() => () => {
    clearQueuedLoad();
  }, [clearQueuedLoad]);

  const selectableTags = useMemo(() => [...EXPECTED_TAGS_BY_MODE[catalogMode]], [catalogMode]);

  const typeCounts = useMemo(() => getExploreTypeCounts(remoteItems), [remoteItems]);

  const filteredItems = useMemo(() => getFilteredExploreItems(remoteItems, typeFilter), [remoteItems, typeFilter]);

  const useCompactResultsGrid = shouldUseCompactExploreGrid(filteredItems);
  const isTvExperience = experience === 'tv';
  const exploreGridMinTileWidthPx = isTvExperience ? 156 : 180;
  const exploreGridGapPx = isTvExperience ? 11 : 13;

  const virtualizedRange = useMemo(() => {
    return getExploreVirtualizedRange({
      filteredItems,
      useCompactResultsGrid,
      scrollTop,
      viewportHeight,
      viewportWidth,
      minTileWidthPx: exploreGridMinTileWidthPx,
      gridGapPx: exploreGridGapPx,
    });
  }, [
    exploreGridGapPx,
    exploreGridMinTileWidthPx,
    filteredItems,
    scrollTop,
    useCompactResultsGrid,
    viewportHeight,
    viewportWidth,
  ]);

  const showLoadingMoreIndicator = loadingMore || waitingForRateLimit;

  const {
    handleModeChange,
    applyQuickTag,
    handleTagSelect,
    handleClearTag,
    resetExploreFilters,
  } = useExploreFilterActions({
    catalogMode,
    setCatalogMode,
    setTypeFilter,
    setTagFilter,
    resetExploreForTag,
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); navigate(toLibrarySearchPath(query));
  }

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(filteredItems);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [filteredItems, openDetails]);

  return (
    <main className="browse-page media-library-page media-explore-page">
      <ExploreTopNav
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={handleSearch}
        onOpenRandomDetails={openRandomDetails}
        randomDisabled={filteredItems.length === 0}
        user={user}
        onLogout={onLogout}
      />

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
        sectionTitle={catalogMode === 'anime' ? 'Anime Explorer' : 'Movie & TV Explorer'}
        sectionSubtitle={tagFilter
          ? `Showing results from ${providerLabelForMode(catalogMode)} tagged "${tagFilter}".`
          : `Choose a tag to browse ${providerLabelForMode(catalogMode)} titles.`}
        error={error}
        loading={loading}
        filteredItems={filteredItems}
        useCompactResultsGrid={useCompactResultsGrid}
        virtualizedRange={virtualizedRange}
        resultsViewportRef={resultsViewportRef}
        loadMoreSentinelRef={loadMoreSentinelRef}
        showLoadingMoreIndicator={showLoadingMoreIndicator}
        loadingMoreLabel={waitingForRateLimit
          ? 'Waiting for rate limit window...'
          : catalogMode === 'anime'
            ? 'Loading more anime from Jikan...'
            : 'Loading more titles...'}
        waitingForRateLimit={waitingForRateLimit}
        tagFilter={tagFilter}
        hasMore={hasMore}
        onOpenDetails={openDetails}
      />
    </main>
  );
}
