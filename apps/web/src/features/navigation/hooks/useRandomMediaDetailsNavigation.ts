import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMedia } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';
import {
  pickRandomItem,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';

export function useRandomMediaDetailsNavigation(
  token: string,
  enabled = true,
) {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    void listMedia(token).then(
      (items) => {
        if (!cancelled) setCandidates(toRandomDetailsCandidates(items));
      },
      () => {
        if (!cancelled) setCandidates([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  const openRandomDetails = useCallback(async () => {
    let candidate = pickRandomItem(candidates);
    if (!candidate) {
      try {
        const refreshed = toRandomDetailsCandidates(await listMedia(token));
        setCandidates(refreshed);
        candidate = pickRandomItem(refreshed);
      } catch {
        return;
      }
    }
    if (candidate) navigate(`/details/${candidate.id}`);
  }, [candidates, navigate, token]);

  return {
    openRandomDetails,
    randomDetailsDisabled: candidates.length === 0,
  };
}
