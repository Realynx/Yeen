import { useCallback, useState, type FormEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { listMedia } from '../../shared/services/api';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { useSafeBackNavigation } from '../../navigation/services/safeBackNavigation';

interface UsePlayerTopBarActionsOptions {
  token: string;
  mediaId: string;
  navigate: NavigateFunction;
}

export interface PlayerTopBarActions {
  query: string;
  setQuery: (value: string) => void;
  handleSearch: (event: FormEvent<HTMLFormElement>) => void;
  handleBackNavigation: () => void;
  openRandomDetails: () => Promise<void>;
  openCurrentDetails: () => void;
}

export function usePlayerTopBarActions({
  token,
  mediaId,
  navigate,
}: UsePlayerTopBarActionsOptions): PlayerTopBarActions {
  const [query, setQuery] = useState('');
  const navigateBackSafely = useSafeBackNavigation('/');

  const handleBackNavigation = useCallback(() => {
    navigateBackSafely();
  }, [navigateBackSafely]);

  const handleSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }, [navigate, query]);

  const openRandomDetails = useCallback(async () => {
    try {
      const mediaItems = await listMedia(token);
      const randomCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!randomCandidate) {
        return;
      }

      navigate(`/details/${randomCandidate.id}`);
    } catch {
      // Keep playback uninterrupted if random details lookup fails.
    }
  }, [navigate, token]);

  const openCurrentDetails = useCallback(() => {
    if (!mediaId) {
      return;
    }

    navigate(`/details/${mediaId}`);
  }, [mediaId, navigate]);

  return {
    query,
    setQuery,
    handleSearch,
    handleBackNavigation,
    openRandomDetails,
    openCurrentDetails,
  };
}
