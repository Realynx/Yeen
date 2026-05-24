import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TorrentItem } from '../../../shared/services/types';
import {
  TORRENT_STATE_CATEGORY_LABELS,
  TORRENT_STATE_CATEGORY_ORDER,
  categorizeTorrentState,
  formatTorrentState,
  type TorrentStateCategoryGroup,
  type TorrentStateCategoryKey,
} from './torrentControlUtils';

export type TorrentPanelSectionId = 'addTorrent' | 'torrentLibrary';

interface UseTorrentControlSelectionStateOptions {
  items: TorrentItem[];
}

export interface TorrentControlSelectionState {
  searchQuery: string;
  searchActive: boolean;
  selectedHashes: string[];
  hasSelection: boolean;
  selectedCount: number;
  filteredTorrentCount: number;
  totalTorrentCount: number;
  groupCount: number;
  visibleHashesLength: number;
  allVisibleSelected: boolean;
  categorizedItems: TorrentStateCategoryGroup[];
  hiddenCategories: Partial<Record<TorrentStateCategoryKey, boolean>>;
  selectedHashSet: Set<string>;
  expandedSections: Record<TorrentPanelSectionId, boolean>;
  togglePanelSection: (section: TorrentPanelSectionId) => void;
  toggleCategory: (key: TorrentStateCategoryKey) => void;
  setSearchQuery: (value: string) => void;
  toggleVisibleSelection: () => void;
  clearSelection: () => void;
  toggleSelection: (hash: string, shiftKey?: boolean) => void;
  removeHashesFromSelection: (hashes: string[]) => void;
}

export function useTorrentControlSelectionState({
  items,
}: UseTorrentControlSelectionStateOptions): TorrentControlSelectionState {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHashes, setSelectedHashes] = useState<string[]>([]);
  const [selectionAnchorHash, setSelectionAnchorHash] = useState<string | null>(
    null,
  );
  const [hiddenCategories, setHiddenCategories] = useState<
    Partial<Record<TorrentStateCategoryKey, boolean>>
  >({});
  const [expandedSections, setExpandedSections] = useState<
    Record<TorrentPanelSectionId, boolean>
  >({
    addTorrent: true,
    torrentLibrary: true,
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchActive = normalizedSearchQuery.length > 0;

  const filteredItems = useMemo(() => {
    if (!searchActive) {
      return items;
    }

    return items.filter((item) => {
      const haystack = `${item.name}\n${item.hash}\n${formatTorrentState(item.state)}\n${item.state}`
        .toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [items, normalizedSearchQuery, searchActive]);

  const categorizedItems = useMemo<TorrentStateCategoryGroup[]>(() => {
    const groupedByCategory: Record<TorrentStateCategoryKey, TorrentItem[]> = {
      downloading: [],
      seeding: [],
      paused: [],
      queued: [],
      checking: [],
      moving: [],
      error: [],
      other: [],
    };

    for (const item of filteredItems) {
      const categoryKey = categorizeTorrentState(item.state);
      groupedByCategory[categoryKey].push(item);
    }

    return TORRENT_STATE_CATEGORY_ORDER.map((key) => ({
      key,
      label: TORRENT_STATE_CATEGORY_LABELS[key],
      items: groupedByCategory[key],
    })).filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const selectedHashSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);

  const visibleHashes = useMemo(
    () =>
      categorizedItems
        .filter((group) => searchActive || !(hiddenCategories[group.key] ?? true))
        .flatMap((group) => group.items.map((item) => item.hash)),
    [categorizedItems, hiddenCategories, searchActive],
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleHashes.length > 0 &&
      visibleHashes.every((hash) => selectedHashSet.has(hash)),
    [visibleHashes, selectedHashSet],
  );

  const selectedCount = selectedHashes.length;
  const hasSelection = selectedCount > 0;
  const totalTorrentCount = items.length;
  const filteredTorrentCount = filteredItems.length;
  const groupCount = categorizedItems.length;

  const togglePanelSection = useCallback((section: TorrentPanelSectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const toggleCategory = useCallback((key: TorrentStateCategoryKey) => {
    setHiddenCategories((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const toggleSelection = useCallback((hash: string, shiftKey = false) => {
    setSelectedHashes((previous) => {
      const nextSet = new Set(previous);
      const shouldSelect = !nextSet.has(hash);

      if (shiftKey && selectionAnchorHash && selectionAnchorHash !== hash) {
        const anchorIndex = visibleHashes.indexOf(selectionAnchorHash);
        const targetIndex = visibleHashes.indexOf(hash);

        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [rangeStart, rangeEnd] =
            anchorIndex < targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex];
          const range = visibleHashes.slice(rangeStart, rangeEnd + 1);

          if (shouldSelect) {
            for (const rangeHash of range) {
              nextSet.add(rangeHash);
            }
          } else {
            for (const rangeHash of range) {
              nextSet.delete(rangeHash);
            }
          }

          return Array.from(nextSet);
        }
      }

      if (shouldSelect) {
        nextSet.add(hash);
      } else {
        nextSet.delete(hash);
      }

      return Array.from(nextSet);
    });

    setSelectionAnchorHash(hash);
  }, [selectionAnchorHash, visibleHashes]);

  const toggleVisibleSelection = useCallback(() => {
    if (visibleHashes.length === 0) {
      return;
    }

    setSelectedHashes((previous) => {
      const previousSet = new Set(previous);
      const visibleHashSet = new Set(visibleHashes);
      const everyVisibleSelected = visibleHashes.every((hash) =>
        previousSet.has(hash),
      );

      if (everyVisibleSelected) {
        return previous.filter((hash) => !visibleHashSet.has(hash));
      }

      for (const hash of visibleHashes) {
        previousSet.add(hash);
      }

      return Array.from(previousSet);
    });
  }, [visibleHashes]);

  const clearSelection = useCallback(() => {
    setSelectedHashes([]);
    setSelectionAnchorHash(null);
  }, []);

  const removeHashesFromSelection = useCallback((hashes: string[]) => {
    if (!hashes.length) {
      return;
    }

    setSelectedHashes((previous) => previous.filter((hash) => !hashes.includes(hash)));
  }, []);

  useEffect(() => {
    const validHashes = new Set(items.map((item) => item.hash));
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedHashes((previous) => {
      const next = previous.filter((hash) => validHashes.has(hash));
      return next.length === previous.length ? previous : next;
    });
    setSelectionAnchorHash((previous) =>
      previous && validHashes.has(previous) ? previous : null,
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [items]);

  return {
    searchQuery,
    searchActive,
    selectedHashes,
    hasSelection,
    selectedCount,
    filteredTorrentCount,
    totalTorrentCount,
    groupCount,
    visibleHashesLength: visibleHashes.length,
    allVisibleSelected,
    categorizedItems,
    hiddenCategories,
    selectedHashSet,
    expandedSections,
    togglePanelSection,
    toggleCategory,
    setSearchQuery,
    toggleVisibleSelection,
    clearSelection,
    toggleSelection,
    removeHashesFromSelection,
  };
}
