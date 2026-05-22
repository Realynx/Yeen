import type { MediaItem } from '../lib/types';

interface LibraryManageBarProps {
  selectedCount: number;
  filteredCount: number;
  filteredItems: MediaItem[];
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
  onEditSingle: (item: MediaItem) => void;
  mediaItems: MediaItem[];
  onAssign: () => void;
  onDelete: () => void;
}

export function LibraryManageBar({
  selectedCount,
  filteredCount,
  filteredItems,
  selectedIds,
  onClearSelection,
  onSelectAllVisible,
  onEditSingle,
  mediaItems,
  onAssign,
  onDelete,
}: LibraryManageBarProps) {
  const allVisibleSelected =
    filteredCount > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  return (
    <section className="library-manage-bar" aria-label="Bulk actions">
      <div className="library-manage-info">
        <strong>{selectedCount}</strong> selected
        <span className="muted">
          of {filteredCount} visible · Shift-click to select a range
        </span>
        {selectedCount > 0 ? (
          <button
            type="button"
            className="library-clear-button"
            onClick={onClearSelection}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="library-manage-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={onSelectAllVisible}
          disabled={filteredCount === 0}
        >
          {allVisibleSelected
            ? 'Deselect All'
            : `Select All (${filteredCount})`}
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={selectedCount !== 1}
          onClick={() => {
            const onlyId = [...selectedIds][0];
            const target = mediaItems.find((item) => item.id === onlyId);
            if (target) onEditSingle(target);
          }}
        >
          Edit Single…
        </button>
        <button
          type="button"
          className="accent-button"
          disabled={selectedCount === 0}
          onClick={onAssign}
        >
          Assign to Series…
        </button>
        <button
          type="button"
          className="danger-button"
          disabled={selectedCount === 0}
          onClick={onDelete}
        >
          Delete To Recycle…
        </button>
      </div>
    </section>
  );
}
