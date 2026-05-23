import { useCallback, useMemo, useState } from 'react';
import type { MediaItem } from '../../shared/services/types';
import {
  normalizeTags,
  sortMediaItems,
  toLibraryType,
  type MediaSortOrder,
  type MediaTypeFilter,
} from './mediaLibraryUtils';

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
}

export function useMediaLibraryFilters({
  routeSearchTerm,
  activeSearch,
  libraryItems,
}: UseMediaLibraryFiltersArgs) {
  const [queryState, setQueryState] = useState({
    routeSearchTerm,
    value: routeSearchTerm,
  });
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
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
    const byType =
      typeFilter === 'all'
        ? libraryItems
        : libraryItems.filter((item) => toLibraryType(item) === typeFilter);

    const normalizedTagFilter = tagFilter.trim().toLowerCase();
    const byTag = normalizedTagFilter
      ? byType.filter((item) =>
          item.tags.some(
            (tag) => tag.trim().toLowerCase() === normalizedTagFilter,
          ))
      : byType;

    return sortMediaItems(byTag, sortOrder);
  }, [libraryItems, sortOrder, tagFilter, typeFilter]);

  const activeSearchLabel = useMemo(() => {
    const searchLabel = activeSearch ? `matches for "${activeSearch}"` : null;
    const tagLabel = tagFilter ? `tag "${tagFilter}"` : null;

    if (searchLabel && tagLabel) {
      return `Showing ${searchLabel} with ${tagLabel}`;
    }

    if (searchLabel) {
      return `Showing ${searchLabel}`;
    }

    if (tagLabel) {
      return `Showing items with ${tagLabel}`;
    }

    return 'Showing all indexed media';
  }, [activeSearch, tagFilter]);

  const hasSearchOrTagFilter = Boolean(activeSearch) || Boolean(tagFilter);

  const resetFilters = useCallback(() => {
    setTypeFilter('all');
    setTagFilter('');
    setSortOrder('updated-desc');
  }, []);

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
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
