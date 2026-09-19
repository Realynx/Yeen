import { useCallback, useMemo, useState } from "react";
import { buildHomeCurationFeed, type HomeFeedExperience } from "./homeCuration";
import {
  readDismissedContinueWatchingIds,
  writeDismissedContinueWatchingIds,
} from "./continueWatching";
import type { MediaItem, ProgressEntry } from "../../shared/services/types";

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
  const [dismissedState, setDismissedState] = useState(() => ({
    userId,
    ids: readDismissedContinueWatchingIds(userId),
  }));
  const dismissedContinueWatchingIds =
    dismissedState.userId === userId
      ? dismissedState.ids
      : readDismissedContinueWatchingIds(userId);

  const feed = useMemo(
    () =>
      buildHomeCurationFeed({
        mediaItems,
        progressItems,
        dismissedContinueWatchingIds,
        randomSeed,
        experience,
      }),
    [
      dismissedContinueWatchingIds,
      experience,
      mediaItems,
      progressItems,
      randomSeed,
    ],
  );

  const dismissContinueWatching = useCallback(
    (mediaId: string) => {
      setDismissedState((current) => {
        const currentIds =
          current.userId === userId
            ? current.ids
            : readDismissedContinueWatchingIds(userId);
        const next = new Set(currentIds);
        next.add(mediaId);
        writeDismissedContinueWatchingIds(userId, next);
        return { userId, ids: next };
      });
    },
    [userId],
  );

  return { feed, dismissContinueWatching };
}
