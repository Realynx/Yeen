import { useEffect, useMemo, useState } from 'react';
import {
  getRemoteSeriesEpisodeCatalog,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  MediaItem,
  RemoteSeriesEpisodeCatalogResult,
} from '../../shared/services/types';

interface CatalogState {
  key: string | null;
  catalog: RemoteSeriesEpisodeCatalogResult | null;
  error: string | null;
}

export function useRemoteSeriesEpisodeCatalog(input: {
  token: string;
  current: MediaItem | null;
}) {
  const targetId =
    input.current?.isRemote && input.current.type === 'show'
      ? input.current.id
      : null;
  const targetKey = targetId
    ? `${targetId}:${input.current?.updatedAt ?? ''}`
    : null;
  const [state, setState] = useState<CatalogState>({
    key: null,
    catalog: null,
    error: null,
  });

  useEffect(() => {
    if (!targetId || !targetKey) return;
    let cancelled = false;
    void getRemoteSeriesEpisodeCatalog(input.token, targetId)
      .then((catalog) => {
        if (!cancelled) setState({ key: targetKey, catalog, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            key: targetKey,
            catalog: null,
            error: toApiErrorMessage(
              error,
              'Failed to load the remote episode catalog.',
            ),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [input.token, targetId, targetKey]);

  return useMemo(() => {
    if (!targetKey) return { catalog: null, loading: false, error: null };
    if (state.key !== targetKey) {
      return { catalog: null, loading: true, error: null };
    }
    return { catalog: state.catalog, loading: false, error: state.error };
  }, [state, targetKey]);
}
