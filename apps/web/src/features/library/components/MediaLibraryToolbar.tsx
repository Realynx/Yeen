import { MediaLibraryFilterControls } from './MediaLibraryFilterControls';
import type { MediaLibraryFilters } from '../services/useMediaLibraryFilters';

interface MediaLibraryToolbarProps {
  filters: MediaLibraryFilters;
  isAdmin: boolean;
  manageMode: boolean;
  onClearSearch: () => void;
  onToggleManageMode: () => void;
}

export function MediaLibraryToolbar({
  filters,
  isAdmin,
  manageMode,
  onClearSearch,
  onToggleManageMode,
}: MediaLibraryToolbarProps) {
  return (
    <section className="library-toolbar" aria-label="Library filters and order options">
      <MediaLibraryFilterControls
        idPrefix="library"
        {...filters}
      />

      <div className="library-stat-block" aria-live="polite">
        <span className="library-stat-value">{filters.filteredItems.length.toLocaleString()}</span>
        <span className="library-stat-label">Titles Shown</span>
        {filters.hasSearchOrTagFilter ? (
          <button
            type="button"
            className="library-clear-button"
            onClick={onClearSearch}
          >
            Clear Filters
          </button>
        ) : null}
        {isAdmin ? (
          <button
            type="button"
            className={manageMode ? 'library-clear-button is-active' : 'library-clear-button'}
            onClick={onToggleManageMode}
          >
            {manageMode ? 'Exit Manage' : 'Manage'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
