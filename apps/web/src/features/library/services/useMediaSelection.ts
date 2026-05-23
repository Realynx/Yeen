import { useCallback, useRef, useState } from 'react';

interface UseMediaSelectionResult {
  selectedIds: Set<string>;
  visibleIdsRef: React.MutableRefObject<string[]>;
  toggleSelection: (mediaId: string, modifiers: { shift: boolean }) => void;
  clearSelection: () => void;
  selectAllVisible: () => void;
}

export function useMediaSelection(): UseMediaSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const visibleIdsRef = useRef<string[]>([]);

  const toggleSelection = useCallback(
    (mediaId: string, modifiers: { shift: boolean }) => {
      const visibleIds = visibleIdsRef.current;
      const anchor = lastSelectedIdRef.current;

      if (modifiers.shift && anchor && anchor !== mediaId) {
        const anchorIndex = visibleIds.indexOf(anchor);
        const targetIndex = visibleIds.indexOf(mediaId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [from, to] =
            anchorIndex < targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex];
          const range = visibleIds.slice(from, to + 1);
          setSelectedIds((current) => {
            const next = new Set(current);
            for (const id of range) {
              next.add(id);
            }
            return next;
          });
          lastSelectedIdRef.current = mediaId;
          return;
        }
      }

      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(mediaId)) {
          next.delete(mediaId);
        } else {
          next.add(mediaId);
        }
        return next;
      });
      lastSelectedIdRef.current = mediaId;
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const selectAllVisible = useCallback(() => {
    const visibleIds = visibleIdsRef.current;
    setSelectedIds((current) => {
      if (visibleIds.length === 0) return current;
      const allSelected = visibleIds.every((id) => current.has(id));
      if (allSelected) {
        const next = new Set(current);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(current);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, []);

  return { selectedIds, visibleIdsRef, toggleSelection, clearSelection, selectAllVisible };
}
