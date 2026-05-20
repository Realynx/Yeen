import { useCallback, useEffect, useState } from 'react';
import { listMedia, listProgress, toApiErrorMessage } from '../lib/api';
import type { MediaItem, ProgressEntry } from '../lib/types';

interface UseMediaLibraryResult {
  mediaItems: MediaItem[];
  progressItems: ProgressEntry[];
  loading: boolean;
  error: string | null;
  activeSearch: string | undefined;
  load: (search?: string) => Promise<void>;
  refresh: () => Promise<void>;
  setError: (message: string | null) => void;
}

export function useMediaLibrary(token: string): UseMediaLibraryResult {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState<string | undefined>(undefined);

  const fetchAll = useCallback(
    async (search: string | undefined, isInitial: boolean) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }

      try {
        const [media, progress] = await Promise.all([
          listMedia(token, search),
          listProgress(token),
        ]);
        return { media, progress };
      } catch (fetchError) {
        if (isInitial) {
          setError(toApiErrorMessage(fetchError, 'Failed to load media library.'));
        }
        return null;
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    },
    [token],
  );

  const load = useCallback(
    async (search?: string) => {
      const normalizedSearch = search?.trim();
      const searchValue = normalizedSearch ? normalizedSearch : undefined;

      const result = await fetchAll(searchValue, true);
      if (result) {
        setMediaItems(result.media);
        setProgressItems(result.progress);
        setActiveSearch(searchValue);
      }
    },
    [fetchAll],
  );

  const refresh = useCallback(async () => {
    const result = await fetchAll(activeSearch, false);
    if (result) {
      setMediaItems(result.media);
      setProgressItems(result.progress);
      setError(null);
    }
  }, [activeSearch, fetchAll]);

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Background polling every 8 seconds
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await fetchAll(activeSearch, false);
      if (!cancelled && result) {
        setMediaItems(result.media);
        setProgressItems(result.progress);
      }
    }

    const intervalId = window.setInterval(() => {
      void poll();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSearch, fetchAll]);

  return { mediaItems, progressItems, loading, error, activeSearch, load, refresh, setError };
}
