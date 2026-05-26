import { useCallback, useMemo, useState } from 'react';
import {
  buildHomeCurationFeed,
  type HomeFeedExperience,
} from './homeCuration';
import {
  readDismissedContinueWatchingIds,
  writeDismissedContinueWatchingIds,
} from './continueWatching';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';

interface UseHomeCurationArgs {
  userId: string;
  mediaItems: readonly MediaItem[];
  progressItems: readonly ProgressEntry[];
  randomSeed: number;
  experience: HomeFeedExperience;
}

export function useHomeCuration({
  userId,
  mediaItems,
  progressItems,
  randomSeed,
  experience,
}: UseHomeCurationArgs) {
  const [dismissedContinueWatchingIds, setDismissedContinueWatchingIds] = useState(() =>
    readDismissedContinueWatchingIds(userId),
  );

  const feed = useMemo(() => buildHomeCurationFeed({
    mediaItems,
    progressItems,
    dismissedContinueWatchingIds,
    randomSeed,
    experience,
  }), [dismissedContinueWatchingIds, experience, mediaItems, progressItems, randomSeed]);

  const dismissContinueWatching = useCallback((mediaId: string) => {
    setDismissedContinueWatchingIds((current) => {
      const next = new Set(current);
      next.add(mediaId);
      writeDismissedContinueWatchingIds(userId, next);
      return next;
    });
  }, [userId]);

  return { feed, dismissContinueWatching };
}
