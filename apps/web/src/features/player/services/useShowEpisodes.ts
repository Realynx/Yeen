import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEpisodeNavigation, listMedia } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';
import {
  episodeFrameImageUrl,
  normalizeShowKey,
} from '../../media-details/services/mediaDetailsUtils';
import { compareEpisodeOrder } from './episodeOrdering';

export interface ShowEpisodesState {
  showEpisodes: MediaItem[];
  previousEpisode: MediaItem | null;
  nextEpisode: MediaItem | null;
  previousEpisodeImage: string | null;
  nextEpisodeImage: string | null;
  autoAdvanceSeconds: number | null;
  cancelAutoAdvance: () => void;
  /**
   * Wraps a video-ended handler so that when the current item is a show
   * episode, the next episode is navigated to at most once per target id.
   */
  withAutoAdvance: (onEnded: () => void) => () => void;
}

export function useShowEpisodes(
  token: string,
  media: MediaItem | null,
  mediaId: string,
): ShowEpisodesState {
  const navigate = useNavigate();
  const [showEpisodes, setShowEpisodes] = useState<MediaItem[]>([]);
  const [apiPreviousEpisode, setApiPreviousEpisode] = useState<MediaItem | null>(null);
  const [apiNextEpisode, setApiNextEpisode] = useState<MediaItem | null>(null);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number | null>(null);
  const autoAdvanceLockRef = useRef<string | null>(null);
  const autoAdvanceIntervalRef = useRef<number | null>(null);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);

  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvanceIntervalRef.current !== null) {
      window.clearInterval(autoAdvanceIntervalRef.current);
      autoAdvanceIntervalRef.current = null;
    }

    if (autoAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    autoAdvanceLockRef.current = null;
    setAutoAdvanceSeconds(null);
  }, []);

  useEffect(() => cancelAutoAdvance, [cancelAutoAdvance, mediaId]);

  useEffect(() => {
    let cancelled = false;

    async function loadShowEpisodes() {
      if (!media || media.type !== 'show') {
        setShowEpisodes([]);
        setApiPreviousEpisode(null);
        setApiNextEpisode(null);
        return;
      }

      try {
        const [items, navigation] = await Promise.all([
          listMedia(token),
          getEpisodeNavigation(token, mediaId).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }

        const showKey = normalizeShowKey(media);
        const siblingEpisodes = items
          .filter((item) => item.type === 'show' && normalizeShowKey(item) === showKey)
          .sort(compareEpisodeOrder);
        setShowEpisodes(siblingEpisodes);
        setApiPreviousEpisode(navigation?.previousEpisode ?? null);
        setApiNextEpisode(navigation?.nextEpisode ?? null);
      } catch {
        if (!cancelled) {
          setShowEpisodes([]);
          setApiPreviousEpisode(null);
          setApiNextEpisode(null);
        }
      }
    }

    void loadShowEpisodes();

    return () => {
      cancelled = true;
    };
  }, [media, mediaId, token]);

  const currentEpisodeIndex = useMemo(() => {
    if (!media || media.type !== 'show') {
      return -1;
    }

    return showEpisodes.findIndex((item) => item.id === media.id);
  }, [media, showEpisodes]);

  const previousEpisode =
    apiPreviousEpisode ??
    (currentEpisodeIndex > 0 ? showEpisodes[currentEpisodeIndex - 1] : null);
  const nextEpisode =
    apiNextEpisode ??
    (currentEpisodeIndex >= 0 && currentEpisodeIndex < showEpisodes.length - 1
      ? showEpisodes[currentEpisodeIndex + 1]
      : null);

  const previousEpisodeImage = previousEpisode ? episodeFrameImageUrl(previousEpisode) : null;
  const nextEpisodeImage = nextEpisode ? episodeFrameImageUrl(nextEpisode) : null;

  const withAutoAdvance = useCallback(
    (onEnded: () => void) => {
      return () => {
        onEnded();

        if (!nextEpisode) {
          return;
        }

        if (autoAdvanceLockRef.current === nextEpisode.id) {
          return;
        }

        autoAdvanceLockRef.current = nextEpisode.id;
        setAutoAdvanceSeconds(10);

        autoAdvanceIntervalRef.current = window.setInterval(() => {
          setAutoAdvanceSeconds((current) => {
            if (current === null) {
              return null;
            }

            return Math.max(0, current - 1);
          });
        }, 1000);

        autoAdvanceTimeoutRef.current = window.setTimeout(() => {
          cancelAutoAdvance();
          navigate(`/player/${nextEpisode.id}`);
        }, 10000);
      };
    },
    [cancelAutoAdvance, navigate, nextEpisode],
  );

  return {
    showEpisodes,
    previousEpisode,
    nextEpisode,
    previousEpisodeImage,
    nextEpisodeImage,
    autoAdvanceSeconds,
    cancelAutoAdvance,
    withAutoAdvance,
  };
}
