import { useState } from 'react';
import { MediaLibraryFilterControls } from './MediaLibraryFilterControls';
import type { MediaLibraryFilters } from '../services/useMediaLibraryFilters';

interface MediaLibraryToolbarProps {
  filters: MediaLibraryFilters;
  collapsible?: boolean;
  isAdmin: boolean;
  manageMode: boolean;
  onClearSearch: () => void;
  onToggleManageMode: () => void;
}

export function MediaLibraryToolbar({
  filters,
  collapsible = false,
  isAdmin,
  manageMode,
  onClearSearch,
  onToggleManageMode,
}: MediaLibraryToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (collapsible) {
    return (
      <section
        className={`library-toolbar tv-library-toolbar${filtersOpen ? ' is-open' : ''}`}
        aria-label="Library filters and order options"
      >
        <div className="tv-library-toolbar-summary">
          <div className="tv-library-toolbar-count" aria-live="polite">
            <strong>{filters.filteredItems.length.toLocaleString()}</strong>
            <span>titles</span>
          </div>

          <div className="tv-library-toolbar-actions">
            <button
              type="button"
              className="library-clear-button"
              aria-expanded={filtersOpen}
              aria-controls="tv-library-filter-controls"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              {filtersOpen ? 'Hide Filters' : 'Filters'}
            </button>
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
        </div>

        {filtersOpen ? (
          <div id="tv-library-filter-controls">
            <MediaLibraryFilterControls idPrefix="library" {...filters} />
          </div>
        ) : null}
      </section>
    );
  }

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
