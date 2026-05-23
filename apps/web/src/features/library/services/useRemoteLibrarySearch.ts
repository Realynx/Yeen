import { useEffect, useState } from 'react';
import { searchRemoteMedia, toApiErrorMessage } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';

interface UseRemoteLibrarySearchArgs {
  token: string;
  activeSearch: string | null;
  manageMode: boolean;
}

export function useRemoteLibrarySearch({
  token,
  activeSearch,
  manageMode,
}: UseRemoteLibrarySearchArgs) {
  const [remoteItems, setRemoteItems] = useState<MediaItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteResults() {
      const searchTerm = activeSearch?.trim() ?? '';

      if (!searchTerm || manageMode) {
        setRemoteItems([]);
        setRemoteLoading(false);
        setRemoteError(null);
        return;
      }

      setRemoteLoading(true);
      setRemoteError(null);

      try {
        const payload = await searchRemoteMedia(token, searchTerm, 24);
        if (!cancelled) {
          setRemoteItems(payload.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRemoteItems([]);
          setRemoteError(
            toApiErrorMessage(loadError, 'Failed to search remote media catalogs.'),
          );
        }
      } finally {
        if (!cancelled) {
          setRemoteLoading(false);
        }
      }
    }

    void loadRemoteResults();

    return () => {
      cancelled = true;
    };
  }, [activeSearch, manageMode, token]);

  return {
    remoteItems,
    remoteLoading,
    remoteError,
  };
}
