import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMedia } from '../../lib/api';
import type { MediaItem } from '../../lib/types';
import {
  episodeFrameImageUrl,
  normalizeShowKey,
} from '../media-details/mediaDetailsUtils';
import { compareEpisodeOrder } from './episodeOrdering';

export interface ShowEpisodesState {
  showEpisodes: MediaItem[];
  previousEpisode: MediaItem | null;
  nextEpisode: MediaItem | null;
  previousEpisodeImage: string | null;
  nextEpisodeImage: string | null;
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
  const autoAdvanceLockRef = useRef<string | null>(null);

  useEffect(() => {
    autoAdvanceLockRef.current = null;
  }, [mediaId]);

  useEffect(() => {
    let cancelled = false;

    async function loadShowEpisodes() {
      if (!media || media.type !== 'show') {
        setShowEpisodes([]);
        return;
      }

      try {
        const items = await listMedia(token);
        if (cancelled) {
          return;
        }

        const showKey = normalizeShowKey(media);
        const siblingEpisodes = items
          .filter((item) => item.type === 'show' && normalizeShowKey(item) === showKey)
          .sort(compareEpisodeOrder);
        setShowEpisodes(siblingEpisodes);
      } catch {
        if (!cancelled) {
          setShowEpisodes([]);
        }
      }
    }

    void loadShowEpisodes();

    return () => {
      cancelled = true;
    };
  }, [media?.id, media?.type, media?.normalizedTitle, media?.title, token]);

  const currentEpisodeIndex = useMemo(() => {
    if (!media || media.type !== 'show') {
      return -1;
    }

    return showEpisodes.findIndex((item) => item.id === media.id);
  }, [media, showEpisodes]);

  const previousEpisode =
    currentEpisodeIndex > 0 ? showEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode =
    currentEpisodeIndex >= 0 && currentEpisodeIndex < showEpisodes.length - 1
      ? showEpisodes[currentEpisodeIndex + 1]
      : null;

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
        navigate(`/player/${nextEpisode.id}`);
      };
    },
    [navigate, nextEpisode],
  );

  return {
    showEpisodes,
    previousEpisode,
    nextEpisode,
    previousEpisodeImage,
    nextEpisodeImage,
    withAutoAdvance,
  };
}
