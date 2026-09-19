import { useEffect, useState } from "react";
import {
  listMedia,
  listProgress,
  toApiErrorMessage,
} from "../../shared/services/api";
import type { MediaItem, ProgressEntry } from "../../shared/services/types";
import { subscribeToProgressUpdates } from "../../shared/services/progressUpdates";
import {
  HomeFeedRefreshCoordinator,
  mergeProgressEntries,
} from "./homeFeedRefresh";

interface UseHomeFeedOptions {
  accountId: string;
  refreshIntervalMs?: number;
  initialErrorMessage: string;
}

interface UseHomeFeedResult {
  mediaItems: MediaItem[];
  progressItems: ProgressEntry[];
  loading: boolean;
  error: string | null;
}

export function useHomeFeed(
  token: string,
  options: UseHomeFeedOptions,
): UseHomeFeedResult {
  const { accountId, refreshIntervalMs = 5000, initialErrorMessage } = options;
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [progressItems, setProgressItems] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hasLoadedOnce = false;
    const refreshCoordinator = new HomeFeedRefreshCoordinator<{
      media: MediaItem[];
      progress: ProgressEntry[];
    }>();

    const unsubscribeProgress = subscribeToProgressUpdates(
      accountId,
      (entry) => {
        if (!cancelled) {
          setProgressItems((current) =>
            mergeProgressEntries(current, [entry], accountId),
          );
        }
      },
    );

    async function refreshHomeFeed() {
      if (!hasLoadedOnce) {
        setLoading(true);
        setError(null);
      }

      try {
        await refreshCoordinator.run(
          async () => {
            const [media, progress] = await Promise.all([
              listMedia(token),
              listProgress(token),
            ]);
            return { media, progress };
          },
          ({ media, progress }) => {
            if (cancelled) {
              return;
            }

            setMediaItems(media);
            setProgressItems((current) =>
              mergeProgressEntries(current, progress, accountId),
            );
            setError(null);
          },
        );
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
      refreshCoordinator.invalidate();
      unsubscribeProgress();
      window.clearInterval(intervalId);
    };
  }, [accountId, initialErrorMessage, refreshIntervalMs, token]);

  return {
    mediaItems,
    progressItems,
    loading,
    error,
  };
}
