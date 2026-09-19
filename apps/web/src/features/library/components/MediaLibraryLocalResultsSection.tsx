import { MediaTile } from './MediaTile';
import type {
  MediaItem,
  ProgressEntry,
} from '../../shared/services/types';
import {
  artworkUrlForMedia,
  toProgressPercent,
} from '../services/mediaLibraryUtils';

interface MediaLibraryLocalResultsSectionProps {
  hidden: boolean;
  filteredItems: MediaItem[];
  activeSearchLabel: string;
  useCompactResultsGrid: boolean;
  manageMode: boolean;
  selectedIds: Set<string>;
  progressMap: Map<string, ProgressEntry>;
  hasSearchOrTagFilter: boolean;
  onOpenDetails: (mediaId: string) => void;
  onToggleSelection: (
    mediaId: string,
    modifiers: { shift: boolean },
  ) => void;
  onResetFilters: () => void;
  onClearFilters: () => void;
}

export function MediaLibraryLocalResultsSection({
  hidden,
  filteredItems,
  activeSearchLabel,
  useCompactResultsGrid,
  manageMode,
  selectedIds,
  progressMap,
  hasSearchOrTagFilter,
  onOpenDetails,
  onToggleSelection,
  onResetFilters,
  onClearFilters,
}: MediaLibraryLocalResultsSectionProps) {
  if (hidden) {
    return null;
  }

  function statusLabelFor(
    watchedProgressPercent: number | undefined,
    completed: boolean,
  ): string | null {
    if (completed) {
      return 'Watched';
    }

    if (typeof watchedProgressPercent === 'number' && watchedProgressPercent > 5) {
      return `Resume ${Math.round(watchedProgressPercent)}%`;
    }

    return null;
  }

  return (
    <section className="browse-section library-results">
      <div className="section-heading-row">
        <h1 className="section-title">All Media</h1>
        <p className="section-subtitle">{activeSearchLabel}</p>
      </div>

      {filteredItems.length > 0 ? (
        <div
          className={useCompactResultsGrid ? 'library-grid is-compact' : 'library-grid'}
          data-tv-focus-zone="shelf"
          data-tv-focus-lane-id="library-results-grid"
        >
          {filteredItems.map((item) => {
            const itemProgress = progressMap.get(item.id);
            const watchedProgressPercent = toProgressPercent(itemProgress);
            const topRightLabel = statusLabelFor(
              watchedProgressPercent,
              Boolean(itemProgress?.completed),
            );

            return (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={watchedProgressPercent}
                progressKind="watch"
                topRightLabel={topRightLabel}
                layout="library"
                onOpen={onOpenDetails}
                selectable={manageMode}
                selected={selectedIds.has(item.id)}
                onSelectionToggle={onToggleSelection}
              />
            );
          })}
        </div>
      ) : (
        <article className="library-empty">
          <h2>No titles match this filter</h2>
          <p>Try broadening type, tag, watch, quality, runtime, artwork, format, or order filters.</p>
          <div className="library-empty-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={onResetFilters}
            >
              Reset Filters
            </button>
            {hasSearchOrTagFilter ? (
              <button
                type="button"
                className="ghost-button"
                onClick={onClearFilters}
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        </article>
      )}
    </section>
  );
}
