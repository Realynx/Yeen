import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { shouldAutoLoadExplorePage } from './exploreAutoLoad';

interface UseExploreWindowLoadMoreSentinelOptions {
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  remoteItemsLength: number;
  setPage: Dispatch<SetStateAction<number>>;
  tagFilter: string;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
}

export function useExploreWindowLoadMoreSentinel({
  hasMore,
  loading,
  loadingMore,
  remoteItemsLength,
  setPage,
  tagFilter,
  loadMoreSentinelRef,
}: UseExploreWindowLoadMoreSentinelOptions) {
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!loading && !loadingMore) {
      lockedRef.current = false;
    }
  }, [loading, loadingMore, remoteItemsLength]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!shouldAutoLoadExplorePage({
          isIntersecting: entry?.isIntersecting ?? false,
          intersectionRatio: entry?.intersectionRatio ?? 0,
          minimumIntersectionRatio: 0.01,
          loading,
          loadingMore,
          hasMore,
          locked: lockedRef.current,
          tagFilter,
        })) return;

        lockedRef.current = true;
        setPage((previous) => previous + 1);
      },
      { root: null, rootMargin: '240px 0px', threshold: 0.01 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMore,
    loading,
    loadingMore,
    loadMoreSentinelRef,
    remoteItemsLength,
    setPage,
    tagFilter,
  ]);
}
