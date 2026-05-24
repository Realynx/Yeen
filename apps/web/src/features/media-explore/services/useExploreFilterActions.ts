import { useCallback } from 'react';
import {
  QUICK_TAGS_BY_MODE,
  type ExploreCatalogMode,
  type ExploreTypeFilter,
} from './exploreCatalog';

interface UseExploreFilterActionsOptions {
  catalogMode: ExploreCatalogMode;
  setCatalogMode: (mode: ExploreCatalogMode) => void;
  setTypeFilter: (typeFilter: ExploreTypeFilter) => void;
  setTagFilter: (tag: string) => void;
  resetExploreForTag: (tag: string) => void;
}

export function useExploreFilterActions({
  catalogMode,
  setCatalogMode,
  setTypeFilter,
  setTagFilter,
  resetExploreForTag,
}: UseExploreFilterActionsOptions) {
  const handleModeChange = useCallback((nextMode: ExploreCatalogMode) => {
    if (nextMode === catalogMode) {
      return;
    }

    const nextTag = QUICK_TAGS_BY_MODE[nextMode][0] ?? '';
    setCatalogMode(nextMode);
    setTypeFilter('all');
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }, [catalogMode, resetExploreForTag, setCatalogMode, setTagFilter, setTypeFilter]);

  const applyQuickTag = useCallback((tag: string) => {
    const cleanedTag = tag.trim();
    if (cleanedTag.length < 2) {
      return;
    }

    setTagFilter(cleanedTag);
    setTypeFilter('all');
    resetExploreForTag(cleanedTag);
  }, [resetExploreForTag, setTagFilter, setTypeFilter]);

  const handleTagSelect = useCallback((nextTag: string) => {
    setTagFilter(nextTag);
    setTypeFilter('all');
    resetExploreForTag(nextTag);
  }, [resetExploreForTag, setTagFilter, setTypeFilter]);

  const handleClearTag = useCallback(() => {
    setTagFilter('');
    setTypeFilter('all');
    resetExploreForTag('');
  }, [resetExploreForTag, setTagFilter, setTypeFilter]);

  const resetExploreFilters = useCallback(() => {
    const nextTag = QUICK_TAGS_BY_MODE[catalogMode][0] ?? '';
    setTypeFilter('all');
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }, [catalogMode, resetExploreForTag, setTagFilter, setTypeFilter]);

  return {
    handleModeChange,
    applyQuickTag,
    handleTagSelect,
    handleClearTag,
    resetExploreFilters,
  };
}
