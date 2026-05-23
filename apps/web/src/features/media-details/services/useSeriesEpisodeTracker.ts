import { useEffect, useMemo, useState } from 'react';
import {
  getSeriesEpisodeTracker,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  MediaItem,
  SeriesEpisodeTrackerResult,
} from '../../shared/services/types';

interface UseSeriesEpisodeTrackerArgs {
  token: string;
  current: MediaItem | null;
}

interface SeriesEpisodeTrackerState {
  key: string | null;
  tracker: SeriesEpisodeTrackerResult | null;
  loading: boolean;
  error: string | null;
}

export function useSeriesEpisodeTracker({
  token,
  current,
}: UseSeriesEpisodeTrackerArgs) {
  const targetId =
    current && !current.isRemote && current.type === 'show'
      ? current.id
      : null;

  const targetKey =
    targetId && current
      ? `${targetId}:${current.updatedAt ?? ''}`
      : null;

  const [state, setState] = useState<SeriesEpisodeTrackerState>({
    key: null,
    tracker: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!targetId || !targetKey) {
      return;
    }

    let cancelled = false;

    void getSeriesEpisodeTracker(token, targetId)
      .then((payload) => {
        if (!cancelled) {
          setState({
            key: targetKey,
            tracker: payload,
            loading: false,
            error: null,
          });
        }
      })
      .catch((trackerError) => {
        if (!cancelled) {
          setState({
            key: targetKey,
            tracker: null,
            loading: false,
            error: toApiErrorMessage(
              trackerError,
              'Failed to load series completeness tracker.',
            ),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetId, targetKey, token]);

  const view = useMemo(() => {
    if (!targetId || !targetKey) {
      return {
        tracker: null,
        loading: false,
        error: null,
      };
    }

    if (state.key !== targetKey) {
      return {
        tracker: null,
        loading: true,
        error: null,
      };
    }

    return {
      tracker: state.tracker,
      loading: state.loading,
      error: state.error,
    };
  }, [state.error, state.key, state.loading, state.tracker, targetId, targetKey]);

  return view;
}
