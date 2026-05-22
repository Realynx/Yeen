import { useMemo } from 'react';
import type { MediaItem, ProgressEntry } from '../../lib/types';
import {
  areSeriesRelated,
  episodeDisplayTitle,
  isResumableProgress,
  normalizeShowKey,
} from './mediaDetailsUtils';

export type DetailType = 'show' | 'series' | 'movie';

export interface ShowStats {
  seasonCount: number;
  episodeCount: number;
  totalRuntime: number;
  watched: number;
}

export interface MediaDetailsDerivations {
  current: MediaItem | null;
  progressById: Map<string, ProgressEntry>;
  detailType: DetailType;
  showEpisodes: MediaItem[];
  relatedMovies: MediaItem[];
  seasonGroups: [number, MediaItem[]][];
  activeSeason: number | null;
  activeSeasonEpisodes: MediaItem[];
  showStats: ShowStats | null;
  nextUpEpisode: MediaItem | null;
}

export function useMediaDetailsDerivations(
  items: MediaItem[],
  progress: ProgressEntry[],
  mediaId: string,
  selectedSeason: number | null,
): MediaDetailsDerivations {
  const progressById = useMemo(() => {
    const map = new Map<string, ProgressEntry>();
    for (const entry of progress) {
      map.set(entry.mediaId, entry);
    }
    return map;
  }, [progress]);

  const current = useMemo(() => {
    return items.find((item) => item.id === mediaId) ?? null;
  }, [items, mediaId]);

  const showEpisodes = useMemo(() => {
    if (!current || current.type !== 'show') {
      return [];
    }

    const key = normalizeShowKey(current);
    return items
      .filter((item) => item.type === 'show' && normalizeShowKey(item) === key)
      .sort((left, right) => {
        const seasonDelta = (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
        if (seasonDelta !== 0) {
          return seasonDelta;
        }

        const episodeDelta = (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
        if (episodeDelta !== 0) {
          return episodeDelta;
        }

        return episodeDisplayTitle(left).localeCompare(episodeDisplayTitle(right));
      });
  }, [current, items]);

  const relatedMovies = useMemo(() => {
    if (!current || (current.type !== 'movie' && current.type !== 'other')) {
      return [];
    }

    return items
      .filter((item) => item.type === 'movie')
      .filter((candidate) => areSeriesRelated(current, candidate))
      .sort((left, right) => {
        const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
        const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
        if (leftYear !== rightYear) {
          return leftYear - rightYear;
        }

        return left.title.localeCompare(right.title);
      });
  }, [current, items]);

  const detailType: DetailType = useMemo(() => {
    if (!current) {
      return 'movie';
    }

    if (current.isRemote) {
      return 'movie';
    }

    if (current.type === 'show') {
      return 'show';
    }

    if (relatedMovies.length > 1) {
      return 'series';
    }

    return 'movie';
  }, [current, relatedMovies.length]);

  const seasonGroups = useMemo(() => {
    const groups = new Map<number, MediaItem[]>();

    for (const episode of showEpisodes) {
      const season = episode.seasonNumber ?? 0;
      const seasonEntries = groups.get(season) ?? [];
      seasonEntries.push(episode);
      groups.set(season, seasonEntries);
    }

    return [...groups.entries()].sort((left, right) => left[0] - right[0]);
  }, [showEpisodes]);

  const activeSeason = useMemo(() => {
    if (detailType !== 'show' || seasonGroups.length === 0) {
      return null;
    }

    if (selectedSeason !== null && seasonGroups.some(([season]) => season === selectedSeason)) {
      return selectedSeason;
    }

    return seasonGroups[0][0];
  }, [detailType, seasonGroups, selectedSeason]);

  const activeSeasonEpisodes = useMemo(() => {
    if (detailType !== 'show' || activeSeason === null) {
      return [];
    }

    return seasonGroups.find(([season]) => season === activeSeason)?.[1] ?? [];
  }, [detailType, seasonGroups, activeSeason]);

  const showStats = useMemo<ShowStats | null>(() => {
    if (detailType !== 'show') return null;
    const totalRuntime = showEpisodes.reduce((sum, ep) => sum + (ep.durationSeconds || 0), 0);
    const watched = showEpisodes.filter((ep) => progressById.get(ep.id)?.completed).length;
    return {
      seasonCount: seasonGroups.length,
      episodeCount: showEpisodes.length,
      totalRuntime,
      watched,
    };
  }, [detailType, showEpisodes, seasonGroups.length, progressById]);

  const nextUpEpisode = useMemo(() => {
    if (detailType !== 'show' || showEpisodes.length === 0) return null;

    const inProgress = showEpisodes.find((ep) => {
      const entry = progressById.get(ep.id);
      return isResumableProgress(entry);
    });
    if (inProgress) return inProgress;

    const firstUnwatched = showEpisodes.find((ep) => !progressById.get(ep.id)?.completed);
    return firstUnwatched ?? showEpisodes[0];
  }, [detailType, showEpisodes, progressById]);

  return {
    current,
    progressById,
    detailType,
    showEpisodes,
    relatedMovies,
    seasonGroups,
    activeSeason,
    activeSeasonEpisodes,
    showStats,
    nextUpEpisode,
  };
}
