import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ExploreCatalogMode } from './exploreCatalog';
import { shouldAutoLoadExplorePage } from './exploreAutoLoad';

interface UseExploreLoadMoreSentinelOptions {
  catalogMode: ExploreCatalogMode;
  clearQueuedLoad: () => void;
  queueLoadAfterCooldown: (waitMs: number) => void;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  remoteItemsLength: number;
  setPage: Dispatch<SetStateAction<number>>;
  tagFilter: string;
  typeFilter: string;
  resultsViewportRef: RefObject<HTMLDivElement | null>;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  loadMoreLockedRef: RefObject<boolean>;
  nextLoadMoreAllowedAtRef: RefObject<number>;
  hasUserScrolledResultsRef: RefObject<boolean>;
  initialAutoFillCountRef: RefObject<number>;
}

export function useExploreLoadMoreSentinel({
  catalogMode,
  clearQueuedLoad,
  queueLoadAfterCooldown,
  hasMore,
  loading,
  loadingMore,
  remoteItemsLength,
  setPage,
  tagFilter,
  typeFilter,
  resultsViewportRef,
  loadMoreSentinelRef,
  loadMoreLockedRef,
  nextLoadMoreAllowedAtRef,
  hasUserScrolledResultsRef,
  initialAutoFillCountRef,
}: UseExploreLoadMoreSentinelOptions) {
  useEffect(() => {
    const viewport = resultsViewportRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!viewport || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!shouldAutoLoadExplorePage({
          isIntersecting: entry?.isIntersecting ?? false,
          intersectionRatio: entry?.intersectionRatio ?? 0,
          minimumIntersectionRatio: 0.2,
          loading,
          loadingMore,
          hasMore,
          locked: loadMoreLockedRef.current,
          tagFilter,
        })) {
          return;
        }

        const isNearBottom =
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 160;
        const allowInitialAutoFill =
          !hasUserScrolledResultsRef.current &&
          initialAutoFillCountRef.current < 1 &&
          viewport.scrollHeight <= viewport.clientHeight + 120;

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
    remoteItemsLength,
    setPage,
    tagFilter,
    typeFilter,
    hasUserScrolledResultsRef,
    initialAutoFillCountRef,
    loadMoreLockedRef,
    loadMoreSentinelRef,
    nextLoadMoreAllowedAtRef,
    resultsViewportRef,
  ]);
}
