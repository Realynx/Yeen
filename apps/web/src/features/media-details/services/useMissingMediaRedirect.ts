import { useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { isRemoteMediaId } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';
import {
  areSeriesRelated,
  normalizeShowKey,
} from './mediaDetailsUtils';

function pickFallbackDetailsItem(
  availableItems: MediaItem[],
  previousItem: MediaItem,
): MediaItem | null {
  const candidates = availableItems.filter(
    (item) => !item.isRemote && item.id !== previousItem.id,
  );
  if (candidates.length === 0) {
    return null;
  }

  if (previousItem.type === 'show') {
    const previousShowKey = normalizeShowKey(previousItem);
    const previousSeason = previousItem.seasonNumber ?? 0;
    const previousEpisode = previousItem.episodeNumber ?? 0;

    const sameShowCandidates = candidates
      .filter(
        (item) =>
          item.type === 'show' && normalizeShowKey(item) === previousShowKey,
      )
      .sort((left, right) => {
        const leftSeason = left.seasonNumber ?? 0;
        const rightSeason = right.seasonNumber ?? 0;
        const leftEpisode = left.episodeNumber ?? 0;
        const rightEpisode = right.episodeNumber ?? 0;

        const leftDistance =
          Math.abs(leftSeason - previousSeason) * 1000
          + Math.abs(leftEpisode - previousEpisode);
        const rightDistance =
          Math.abs(rightSeason - previousSeason) * 1000
          + Math.abs(rightEpisode - previousEpisode);

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        if (leftSeason !== rightSeason) {
          return leftSeason - rightSeason;
        }

        if (leftEpisode !== rightEpisode) {
          return leftEpisode - rightEpisode;
        }

        return left.relativePath.localeCompare(right.relativePath, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });

    if (sameShowCandidates.length > 0) {
      return sameShowCandidates[0];
    }
  }

  const relatedMovie = candidates
    .filter(
      (item) => item.type === 'movie' && areSeriesRelated(previousItem, item),
    )
    .sort((left, right) => {
      const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
      const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
      if (leftYear !== rightYear) {
        return leftYear - rightYear;
      }

      return left.title.localeCompare(right.title);
    })[0];

  if (relatedMovie) {
    return relatedMovie;
  }

  return candidates[0];
}

interface UseMissingMediaRedirectArgs {
  current: MediaItem | null;
  loading: boolean;
  error: string | null;
  mediaId: string;
  items: MediaItem[];
  navigate: NavigateFunction;
}

export function useMissingMediaRedirect({
  current,
  loading,
  error,
  mediaId,
  items,
  navigate,
}: UseMissingMediaRedirectArgs) {
  const lastKnownCurrentRef = useRef<MediaItem | null>(null);
  const lastRedirectedMissingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (current) {
      lastKnownCurrentRef.current = current;
      lastRedirectedMissingIdRef.current = null;
    }
  }, [current]);

  useEffect(() => {
    if (loading || error || current || !mediaId || isRemoteMediaId(mediaId)) {
      return;
    }

    const previousItem = lastKnownCurrentRef.current;
    if (!previousItem || previousItem.id !== mediaId) {
      return;
    }

    if (lastRedirectedMissingIdRef.current === mediaId) {
      return;
    }

    const fallbackItem = pickFallbackDetailsItem(items, previousItem);
    if (!fallbackItem) {
      return;
    }

    lastRedirectedMissingIdRef.current = mediaId;
    navigate(`/details/${fallbackItem.id}`, { replace: true });
  }, [current, error, items, loading, mediaId, navigate]);
}
