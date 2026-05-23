import { useEffect, useState } from 'react';
import { listMedia, listProgress, toApiErrorMessage } from '../../shared/services/api';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';

interface UseHomeFeedOptions {
  refreshIntervalMs?: number;
  initialErrorMessage: string;
}

interface UseHomeFeedResult {
  mediaItems: MediaItem[];
  progressItems: ProgressEntry[];
  loading: boolean;
  error: string | null;
}

export function useHomeFeed(token: string, options: UseHomeFeedOptions): UseHomeFeedResult {
  const { refreshIntervalMs = 5000, initialErrorMessage } = options;
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hasLoadedOnce = false;

    async function refreshHomeFeed() {
      if (!hasLoadedOnce) {
        setLoading(true);
        setError(null);
      }

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
      } catch (loadError) {
        if (!cancelled && !hasLoadedOnce) {
          setError(toApiErrorMessage(loadError, initialErrorMessage));
        }
      } finally {
        if (!cancelled && !hasLoadedOnce) {
          setLoading(false);
        }

        hasLoadedOnce = true;
      }
    }

    void refreshHomeFeed();
    const intervalId = window.setInterval(() => {
      void refreshHomeFeed();
    }, refreshIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [initialErrorMessage, refreshIntervalMs, token]);

  return {
    mediaItems,
    progressItems,
    loading,
    error,
  };
}
