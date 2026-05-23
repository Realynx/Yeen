import { useMemo } from 'react';
import type { MediaItem } from '../../shared/services/types';
import type { LibraryItemGroup } from './mediaLibraryUtils';

interface UseSelectedLibraryItemsArgs {
  libraryItemGroups: LibraryItemGroup[];
  selectedIds: Set<string>;
}

interface SelectedLibraryItemsState {
  selectedMediaItems: MediaItem[];
  hasSeriesAssignmentConflict: boolean;
}

function hasSeriesRules(item: MediaItem): boolean {
  const rules = item.seriesAssignmentRules;
  if (!rules) {
    return false;
  }

  const keywordCount = Array.isArray(rules.keywordMappings)
    ? rules.keywordMappings.length
    : 0;
  const patternCount = Array.isArray(rules.patternMappings)
    ? rules.patternMappings.length
    : 0;

  return keywordCount > 0 || patternCount > 0;
}

export function useSelectedLibraryItems({
  libraryItemGroups,
  selectedIds,
}: UseSelectedLibraryItemsArgs): SelectedLibraryItemsState {
  const libraryGroupById = useMemo(() => {
    const byId = new Map<string, LibraryItemGroup>();
    for (const group of libraryItemGroups) {
      byId.set(group.item.id, group);
    }
    return byId;
  }, [libraryItemGroups]);

  const selectedMediaItems = useMemo(() => {
    const expanded: MediaItem[] = [];
    const seen = new Set<string>();

    for (const selectedId of selectedIds) {
      const group = libraryGroupById.get(selectedId);
      if (!group) {
        continue;
      }

      for (const item of group.sourceItems) {
        if (seen.has(item.id)) {
          continue;
        }

        seen.add(item.id);
        expanded.push(item);
      }
    }

    return expanded;
  }, [libraryGroupById, selectedIds]);

  const selectedSeriesListingCount = useMemo(() => {
    let total = 0;

    for (const selectedId of selectedIds) {
      const group = libraryGroupById.get(selectedId);
      if (!group || group.item.type !== 'show') {
        continue;
      }

      const hasPersistedSeriesRules = group.sourceItems.some(hasSeriesRules);
      if (group.sourceItems.length > 1 || hasPersistedSeriesRules) {
        total += 1;
      }
    }

    return total;
  }, [libraryGroupById, selectedIds]);

  return {
    selectedMediaItems,
    hasSeriesAssignmentConflict: selectedSeriesListingCount > 1,
  };
}
