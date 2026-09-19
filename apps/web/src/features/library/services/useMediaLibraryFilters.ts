import { useCallback, useMemo, useState } from 'react';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import {
  normalizeTags,
  toLibraryType,
  type MediaSortOrder,
  type MediaTypeFilter,
} from './mediaLibraryUtils';
import { defaultLibraryFilterState } from './librarySearchUtils';
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
  routeFilters: MediaLibraryFilterState;
  activeSearch: string | null;
  libraryItems: MediaItem[];
  progressItems: ProgressEntry[];
  onFilterStateChange?: (state: MediaLibraryFilterState) => void;
}

export function useMediaLibraryFilters({
  routeSearchTerm,
  routeFilters,
  activeSearch,
  libraryItems,
  progressItems,
  onFilterStateChange,
}: UseMediaLibraryFiltersArgs) {
  const [queryState, setQueryState] = useState({
    routeSearchTerm,
    value: routeSearchTerm,
  });
  const routeFilterKey = useMemo(
    () => serializeFilterState(routeFilters),
    [routeFilters],
  );
  const [filterStateState, setFilterStateState] = useState({
    routeFilterKey,
    value: routeFilters,
  });

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
  const filterState =
    filterStateState.routeFilterKey === routeFilterKey
      ? filterStateState.value
      : routeFilters;
  const {
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
  } = filterState;
  const updateFilterState = useCallback(
    (updates: Partial<MediaLibraryFilterState>) => {
      const nextState = {
        ...filterState,
        ...updates,
      };
      setFilterStateState({
        routeFilterKey,
        value: nextState,
      });
      onFilterStateChange?.(nextState);
    },
    [filterState, onFilterStateChange, routeFilterKey],
  );
  const setTypeFilter = useCallback((value: MediaTypeFilter) => {
    updateFilterState({ typeFilter: value });
  }, [updateFilterState]);
  const setTagFilter = useCallback((value: string) => {
    updateFilterState({ tagFilter: value });
  }, [updateFilterState]);
  const setWatchStatusFilter = useCallback((value: WatchStatusFilter) => {
    updateFilterState({ watchStatusFilter: value });
  }, [updateFilterState]);
  const setSubtitleAvailabilityFilter = useCallback((value: SubtitleAvailabilityFilter) => {
    updateFilterState({ subtitleAvailabilityFilter: value });
  }, [updateFilterState]);
  const setQualityFilter = useCallback((value: QualityFilter) => {
    updateFilterState({ qualityFilter: value });
  }, [updateFilterState]);
  const setRuntimeFilter = useCallback((value: RuntimeFilter) => {
    updateFilterState({ runtimeFilter: value });
  }, [updateFilterState]);
  const setReleaseYearFilter = useCallback((value: ReleaseYearFilter) => {
    updateFilterState({ releaseYearFilter: value });
  }, [updateFilterState]);
  const setArtworkFilter = useCallback((value: ArtworkFilter) => {
    updateFilterState({ artworkFilter: value });
  }, [updateFilterState]);
  const setChapterFilter = useCallback((value: ChapterFilter) => {
    updateFilterState({ chapterFilter: value });
  }, [updateFilterState]);
  const setFormatFilter = useCallback((value: FormatFilter) => {
    updateFilterState({ formatFilter: value });
  }, [updateFilterState]);
  const setVideoCodecFilter = useCallback((value: VideoCodecFilter) => {
    updateFilterState({ videoCodecFilter: value });
  }, [updateFilterState]);
  const setSortOrder = useCallback((value: MediaSortOrder) => {
    updateFilterState({ sortOrder: value });
  }, [updateFilterState]);

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
    updateFilterState(defaultLibraryFilterState());
  }, [updateFilterState]);

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
    filterState,
    typeCounts,
    availableTags,
    filteredItems,
    activeSearchLabel,
    hasSearchOrTagFilter,
    resetFilters,
  };
}

export type MediaLibraryFilters = ReturnType<typeof useMediaLibraryFilters>;

function serializeFilterState(state: MediaLibraryFilterState): string {
  return [
    state.typeFilter,
    state.tagFilter,
    state.watchStatusFilter,
    state.subtitleAvailabilityFilter,
    state.qualityFilter,
    state.runtimeFilter,
    state.releaseYearFilter,
    state.artworkFilter,
    state.chapterFilter,
    state.formatFilter,
    state.videoCodecFilter,
    state.sortOrder,
  ].join('\u001f');
}
