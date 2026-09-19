import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchRemoteMedia, toApiErrorMessage } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';
import {
  defaultTagForMode,
  type ExploreCatalogMode,
  type ExploreTypeFilter,
} from './exploreCatalog';
import {
  readExploreSessionState,
  writeExploreSessionState,
  type ExploreSessionState,
} from './exploreSessionState';

interface UseExploreCatalogStateOptions {
  token: string;
  remotePageSize?: number;
  loadOnRestoredSession?: boolean;
  skipInitialFetchWhenRestored?: boolean;
  trackScrollTop?: boolean;
  errorMessage?: string;
}

interface UseExploreCatalogStateResult {
  initialScrollTop: number;
  catalogMode: ExploreCatalogMode;
  setCatalogMode: (mode: ExploreCatalogMode) => void;
  tagFilter: string;
  setTagFilter: (tag: string) => void;
  typeFilter: ExploreTypeFilter;
  setTypeFilter: (typeFilter: ExploreTypeFilter) => void;
  remoteItems: MediaItem[];
  page: number;
  setPage: (nextPage: number | ((previous: number) => number)) => void;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  retry: () => void;
  scrollTop: number;
  setScrollTop: (nextScrollTop: number) => void;
  resetExploreForTag: (nextTag: string, options?: { resetScrollTop?: boolean }) => void;
}

function restoredScrollTop(restored: ExploreSessionState | null, trackScrollTop: boolean): number {
  if (!trackScrollTop) return 0;
  return restored?.scrollTop ?? 0;
}

function initialExploreState(
  restored: ExploreSessionState | null,
  trackScrollTop: boolean,
): ExploreSessionState {
  const catalogMode = restored?.catalogMode ?? 'non-anime';
  return {
    catalogMode,
    tagFilter: restored?.tagFilter ?? defaultTagForMode(catalogMode),
    typeFilter: restored?.typeFilter ?? 'all',
    page: restored?.page ?? 1,
    hasMore: restored?.hasMore ?? true,
    remoteItems: restored?.remoteItems ?? [],
    scrollTop: restoredScrollTop(restored, trackScrollTop),
  };
}

export function useExploreCatalogState(
  options: UseExploreCatalogStateOptions,
): UseExploreCatalogStateResult {
  const {
    token,
    remotePageSize = 20,
    loadOnRestoredSession = true,
    skipInitialFetchWhenRestored = false,
    trackScrollTop = true,
    errorMessage = 'Failed to search remote media catalogs.',
  } = options;

  const restoredSessionState = useMemo(() => readExploreSessionState(), []);
  const initial = useMemo(
    () => initialExploreState(restoredSessionState, trackScrollTop),
    [restoredSessionState, trackScrollTop],
  );
  const { catalogMode: initialCatalogMode, tagFilter: initialTagFilter,
    typeFilter: initialTypeFilter, page: initialPage, hasMore: initialHasMore,
    remoteItems: initialRemoteItems, scrollTop: initialScrollTop } = initial;

  const [catalogMode, setCatalogMode] = useState<ExploreCatalogMode>(initialCatalogMode);
  const [tagFilter, setTagFilter] = useState(initialTagFilter);
  const [typeFilter, setTypeFilter] = useState<ExploreTypeFilter>(initialTypeFilter);
  const [remoteItems, setRemoteItems] = useState<MediaItem[]>(initialRemoteItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(() => {
    if (restoredSessionState && !loadOnRestoredSession) {
      return false;
    }

    return initialTagFilter.trim().length >= 2 && initialPage <= 1;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [scrollTop, setScrollTopState] = useState(initialScrollTop);

  const skipInitialFetchRef = useRef(
    skipInitialFetchWhenRestored
      && restoredSessionState !== null
      && (initialRemoteItems.length > 0 || initialTagFilter.trim().length < 2),
  );
  const sessionStateRef = useRef<ExploreSessionState>({
    catalogMode: initialCatalogMode,
    tagFilter: initialTagFilter,
    typeFilter: initialTypeFilter,
    page: initialPage,
    hasMore: initialHasMore,
    remoteItems: initialRemoteItems,
    scrollTop: initialScrollTop,
  });

  const activeProviders = useMemo<Array<'tmdb' | 'jikan'>>(
    () => (catalogMode === 'anime' ? ['jikan'] : ['tmdb']),
    [catalogMode],
  );

  const setScrollTop = useCallback((nextScrollTop: number) => {
    if (!trackScrollTop) {
      return;
    }

    setScrollTopState(nextScrollTop);
  }, [trackScrollTop]);

  const resetExploreForTag = useCallback((
    nextTag: string,
    resetOptions?: { resetScrollTop?: boolean },
  ) => {
    const cleanedTag = nextTag.trim();

    setPage(1);
    setHasMore(cleanedTag.length >= 2);
    setRemoteItems([]);
    setError(null);
    setLoading(cleanedTag.length >= 2);
    setLoadingMore(false);

    if (resetOptions?.resetScrollTop ?? true) {
      setScrollTop(0);
    }

    skipInitialFetchRef.current = false;
  }, [setScrollTop]);

  const retry = useCallback(() => {
    if (tagFilter.trim().length < 2) return;
    setError(null);
    setHasMore(true);
    if (page <= 1) setLoading(true);
    else setLoadingMore(true);
    setRequestAttempt((attempt) => attempt + 1);
  }, [page, tagFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteItems() {
      if (skipInitialFetchRef.current) {
        skipInitialFetchRef.current = false;
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const selectedTag = tagFilter.trim();
      if (selectedTag.length < 2) {
        setRemoteItems([]);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        setError(null);
        return;
      }

      if (page <= 1) {
        setLoading(true);
        setError(null);
      } else {
        setLoading(false);
        setLoadingMore(true);
      }

      try {
        const payload = await searchRemoteMedia(
          token,
          '',
          remotePageSize,
          activeProviders,
          [selectedTag],
          false,
          page,
        );

        if (cancelled) {
          return;
        }

        setHasMore(payload.hasMore);
        setRemoteItems((previous) => {
          if (page <= 1) {
            return payload.items;
          }

          if (payload.items.length === 0) {
            return previous;
          }

          const dedupedById = new Map<string, MediaItem>();
          for (const item of previous) {
            dedupedById.set(item.id, item);
          }

          for (const item of payload.items) {
            dedupedById.set(item.id, item);
          }

          return [...dedupedById.values()];
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (page <= 1) {
          setRemoteItems([]);
        }

        setHasMore(false);
        setError(toApiErrorMessage(loadError, errorMessage));
      } finally {
        if (!cancelled) {
          if (page <= 1) {
            setLoading(false);
          } else {
            setLoading(false);
            setLoadingMore(false);
          }
        }
      }
    }

    void loadRemoteItems();

    return () => {
      cancelled = true;
    };
  }, [activeProviders, errorMessage, page, remotePageSize, requestAttempt, tagFilter, token]);

  useEffect(() => {
    sessionStateRef.current = {
      catalogMode,
      tagFilter,
      typeFilter,
      page,
      hasMore,
      remoteItems,
      scrollTop: trackScrollTop ? scrollTop : 0,
    };
  }, [catalogMode, hasMore, page, remoteItems, scrollTop, tagFilter, trackScrollTop, typeFilter]);

  useEffect(() => {
    writeExploreSessionState(sessionStateRef.current);
  }, [catalogMode, hasMore, page, remoteItems, tagFilter, typeFilter]);

  useEffect(() => {
    return () => {
      writeExploreSessionState(sessionStateRef.current);
    };
  }, []);

  return {
    initialScrollTop,
    catalogMode,
    setCatalogMode,
    tagFilter,
    setTagFilter,
    typeFilter,
    setTypeFilter,
    remoteItems,
    page,
    setPage,
    hasMore,
    loading,
    loadingMore,
    error,
    retry,
    scrollTop: trackScrollTop ? scrollTop : 0,
    setScrollTop,
    resetExploreForTag,
  };
}
