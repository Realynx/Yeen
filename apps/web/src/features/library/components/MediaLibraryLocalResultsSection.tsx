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
  downloadProgressMap: Map<string, number>;
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
  downloadProgressMap,
  hasSearchOrTagFilter,
  onOpenDetails,
  onToggleSelection,
  onResetFilters,
  onClearFilters,
}: MediaLibraryLocalResultsSectionProps) {
  if (hidden) {
    return null;
  }

  return (
    <section className="browse-section library-results">
      <div className="section-heading-row">
        <h1 className="section-title">All Media</h1>
        <p className="section-subtitle">{activeSearchLabel}</p>
      </div>

      {filteredItems.length > 0 ? (
        <div className={useCompactResultsGrid ? 'library-grid is-compact' : 'library-grid'}>
          {filteredItems.map((item) => {
            const downloadProgressPercent = downloadProgressMap.get(item.id);
            const watchedProgressPercent = toProgressPercent(progressMap.get(item.id));

            return (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={downloadProgressPercent ?? watchedProgressPercent}
                progressKind={downloadProgressPercent !== undefined ? 'download' : 'watch'}
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
          <p>Try switching the media type, tag, or order settings.</p>
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
