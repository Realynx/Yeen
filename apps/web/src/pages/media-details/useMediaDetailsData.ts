import { useEffect, useState } from 'react';
import {
  getRemoteMedia,
  isRemoteMediaId,
  listMedia,
  listProgress,
  toApiErrorMessage,
} from '../../lib/api';
import type { MediaItem, ProgressEntry } from '../../lib/types';

interface MediaDetailsDataState {
  items: MediaItem[];
  progress: ProgressEntry[];
  loading: boolean;
  error: string | null;
  reloadVersion: number;
  reload: () => void;
}

export function useMediaDetailsData(mediaId: string, token: string): MediaDetailsDataState {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (isRemoteMediaId(mediaId)) {
          const remoteItem = await getRemoteMedia(token, mediaId);
          if (!cancelled) {
            setItems([remoteItem]);
            setProgress([]);
          }
          return;
        }

        const [mediaItems, progressItems] = await Promise.all([
          listMedia(token),
          listProgress(token).catch(() => [] as ProgressEntry[]),
        ]);
        if (!cancelled) {
          setItems(mediaItems);
          setProgress(progressItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(toApiErrorMessage(loadError, 'Failed to load media details.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (mediaId) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [mediaId, token, reloadVersion]);

  return {
    items,
    progress,
    loading,
    error,
    reloadVersion,
    reload: () => setReloadVersion((value) => value + 1),
  };
}
