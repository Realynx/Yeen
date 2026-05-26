import { useCallback, useMemo, useState } from 'react';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import {
  normalizeTags,
  toLibraryType,
} from './mediaLibraryUtils';
import {
  filterAndSortMediaLibraryItems,
  hasActiveLibraryFilters,
  toActiveLibraryFilterLabels,
  type ArtworkFilter,
  type ChapterFilter,
  type FormatFilter,
  type MediaLibraryFilterState,
  type QualityFilter,
  type ReleaseYearFilter,
  type RuntimeFilter,
  type SubtitleAvailabilityFilter,
  type VideoCodecFilter,
  type WatchStatusFilter,
} from './mediaLibraryFilterUtils';
import type { MediaSortOrder, MediaTypeFilter } from './mediaLibraryUtils';

export interface LibraryTypeCounts {
  all: number;
  movie: number;
  show: number;
}

export interface LibraryTagCount {
  label: string;
  count: number;
}

interface UseMediaLibraryFiltersArgs {
  routeSearchTerm: string;
  activeSearch: string | null;
  libraryItems: MediaItem[];
  progressItems: ProgressEntry[];
}

export function useMediaLibraryFilters({
  routeSearchTerm,
  activeSearch,
  libraryItems,
  progressItems,
}: UseMediaLibraryFiltersArgs) {
  const [queryState, setQueryState] = useState({
    routeSearchTerm,
    value: routeSearchTerm,
  });
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [watchStatusFilter, setWatchStatusFilter] = useState<WatchStatusFilter>('all');
  const [subtitleAvailabilityFilter, setSubtitleAvailabilityFilter] =
    useState<SubtitleAvailabilityFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFilter>('all');
  const [releaseYearFilter, setReleaseYearFilter] = useState<ReleaseYearFilter>('all');
  const [artworkFilter, setArtworkFilter] = useState<ArtworkFilter>('all');
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [videoCodecFilter, setVideoCodecFilter] = useState<VideoCodecFilter>('all');
  const [sortOrder, setSortOrder] = useState<MediaSortOrder>('updated-desc');

  const query =
    queryState.routeSearchTerm === routeSearchTerm
      ? queryState.value
      : routeSearchTerm;

  const setQuery = useCallback(
    (value: string) => {
      setQueryState({
        routeSearchTerm,
        value,
      });
    },
    [routeSearchTerm],
  );

  const typeCounts = useMemo<LibraryTypeCounts>(() => {
    let movie = 0;
    let show = 0;

    for (const item of libraryItems) {
      if (toLibraryType(item) === 'movie') {
        movie += 1;
      }

      if (toLibraryType(item) === 'show') {
        show += 1;
      }
    }

    return {
      all: libraryItems.length,
      movie,
      show,
    };
  }, [libraryItems]);

  const progressMap = useMemo(() => {
    const map = new Map<string, ProgressEntry>();
    for (const entry of progressItems) {
      map.set(entry.mediaId, entry);
    }
    return map;
  }, [progressItems]);

  const availableTags = useMemo<LibraryTagCount[]>(() => {
    const counts = new Map<string, LibraryTagCount>();

    for (const item of libraryItems) {
      for (const tag of normalizeTags(item.tags)) {
        const key = tag.toLowerCase();
        const existing = counts.get(key);

        if (existing) {
          existing.count += 1;
          continue;
        }

        counts.set(key, {
          label: tag,
          count: 1,
        });
      }
    }

    return [...counts.values()].sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label, undefined, {
        sensitivity: 'base',
      });
    });
  }, [libraryItems]);

  const filterState = useMemo<MediaLibraryFilterState>(() => ({
    typeFilter,
    tagFilter,
    watchStatusFilter,
    subtitleAvailabilityFilter,
    qualityFilter,
    runtimeFilter,
    releaseYearFilter,
    artworkFilter,
    chapterFilter,
    formatFilter,
    videoCodecFilter,
    sortOrder,
  }), [
    artworkFilter,
    chapterFilter,
    formatFilter,
    qualityFilter,
    releaseYearFilter,
    runtimeFilter,
    tagFilter,
    typeFilter,
    sortOrder,
    subtitleAvailabilityFilter,
    videoCodecFilter,
    watchStatusFilter,
  ]);

  const filteredItems = useMemo(() => {
    return filterAndSortMediaLibraryItems(libraryItems, progressMap, filterState);
  }, [filterState, libraryItems, progressMap]);

  const activeSearchLabel = useMemo(() => {
    const activeLabels = toActiveLibraryFilterLabels(activeSearch, filterState);

    if (activeLabels.length > 0) {
      return `Showing ${activeLabels.join(' with ')}`;
    }

    return 'Showing all indexed media';
  }, [activeSearch, filterState]);

  const hasSearchOrTagFilter = hasActiveLibraryFilters(activeSearch, filterState);

  const resetFilters = useCallback(() => {
    setTypeFilter('all');
    setTagFilter('');
    setWatchStatusFilter('all');
    setSubtitleAvailabilityFilter('all');
    setQualityFilter('all');
    setRuntimeFilter('all');
    setReleaseYearFilter('all');
    setArtworkFilter('all');
    setChapterFilter('all');
    setFormatFilter('all');
    setVideoCodecFilter('all');
    setSortOrder('updated-desc');
  }, []);

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
    watchStatusFilter,
    setWatchStatusFilter,
    subtitleAvailabilityFilter,
    setSubtitleAvailabilityFilter,
    qualityFilter,
    setQualityFilter,
    runtimeFilter,
    setRuntimeFilter,
    releaseYearFilter,
    setReleaseYearFilter,
    artworkFilter,
    setArtworkFilter,
    chapterFilter,
    setChapterFilter,
    formatFilter,
    setFormatFilter,
    videoCodecFilter,
    setVideoCodecFilter,
    sortOrder,
    setSortOrder,
    typeCounts,
    availableTags,
    filteredItems,
    activeSearchLabel,
    hasSearchOrTagFilter,
    resetFilters,
  };
}

export type MediaLibraryFilters = ReturnType<typeof useMediaLibraryFilters>;
