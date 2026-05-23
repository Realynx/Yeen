import { useCallback, useEffect, useState } from 'react';
import {
  listMedia,
  listMediaTorrentDownloadProgress,
  listProgress,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  MediaItem,
  MediaTorrentDownloadProgressEntry,
  ProgressEntry,
} from '../../shared/services/types';

interface UseMediaLibraryResult {
  mediaItems: MediaItem[];
  progressItems: ProgressEntry[];
  downloadProgressItems: MediaTorrentDownloadProgressEntry[];
  loading: boolean;
  error: string | null;
  activeSearch: string | undefined;
  load: (search?: string) => Promise<void>;
  refresh: () => Promise<void>;
  setError: (message: string | null) => void;
}

export function useMediaLibrary(
  token: string,
  initialSearch?: string,
): UseMediaLibraryResult {
  const normalizedInitialSearch = initialSearch?.trim() || undefined;
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [downloadProgressItems, setDownloadProgressItems] = useState<
    MediaTorrentDownloadProgressEntry[]
  >([]);
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
        const media = await listMedia(token, search);

        const [progress, downloadProgress] = await Promise.all([
          listProgress(token),
          listMediaTorrentDownloadProgress(
            token,
            media.map((item) => item.id),
          ).catch(() => ({ items: [] })),
        ]);

        return {
          media,
          progress,
          downloadProgress: downloadProgress.items,
        };
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
        setDownloadProgressItems(result.downloadProgress);
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
      setDownloadProgressItems(result.downloadProgress);
      setError(null);
    }
  }, [activeSearch, fetchAll]);

  // Initial load and URL-driven search updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(normalizedInitialSearch);
  }, [load, normalizedInitialSearch]);

  // Background polling every 8 seconds
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await fetchAll(activeSearch, false);
      if (!cancelled && result) {
        setMediaItems(result.media);
        setProgressItems(result.progress);
        setDownloadProgressItems(result.downloadProgress);
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

  return {
    mediaItems,
    progressItems,
    downloadProgressItems,
    loading,
    error,
    activeSearch,
    load,
    refresh,
    setError,
  };
}
