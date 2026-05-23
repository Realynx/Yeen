import {
  SORT_OPTIONS,
  type MediaSortOrder,
  type MediaTypeFilter,
} from '../services/mediaLibraryUtils';
import type {
  LibraryTagCount,
  LibraryTypeCounts,
} from '../services/useMediaLibraryFilters';

interface MediaLibraryToolbarProps {
  filteredCount: number;
  typeFilter: MediaTypeFilter;
  typeCounts: LibraryTypeCounts;
  tagFilter: string;
  availableTags: LibraryTagCount[];
  sortOrder: MediaSortOrder;
  hasSearchOrTagFilter: boolean;
  isAdmin: boolean;
  manageMode: boolean;
  onTypeFilterChange: (value: MediaTypeFilter) => void;
  onTagFilterChange: (value: string) => void;
  onSortOrderChange: (value: MediaSortOrder) => void;
  onClearSearch: () => void;
  onToggleManageMode: () => void;
}

export function MediaLibraryToolbar({
  filteredCount,
  typeFilter,
  typeCounts,
  tagFilter,
  availableTags,
  sortOrder,
  hasSearchOrTagFilter,
  isAdmin,
  manageMode,
  onTypeFilterChange,
  onTagFilterChange,
  onSortOrderChange,
  onClearSearch,
  onToggleManageMode,
}: MediaLibraryToolbarProps) {
  return (
    <section className="library-toolbar" aria-label="Library filters and order options">
      <div className="library-filters">
        <div className="library-filter-group">
          <p className="library-filter-label">Media Type</p>
          <div className="library-chip-row" role="group" aria-label="Filter by media type">
            <button
              type="button"
              className={typeFilter === 'all' ? 'library-chip is-active' : 'library-chip'}
              onClick={() => onTypeFilterChange('all')}
            >
              All
              <span className="library-chip-count">{typeCounts.all}</span>
            </button>
            <button
              type="button"
              className={typeFilter === 'movie' ? 'library-chip is-active' : 'library-chip'}
              onClick={() => onTypeFilterChange('movie')}
            >
              Movies
              <span className="library-chip-count">{typeCounts.movie}</span>
            </button>
            <button
              type="button"
              className={typeFilter === 'show' ? 'library-chip is-active' : 'library-chip'}
              onClick={() => onTypeFilterChange('show')}
            >
              Shows
              <span className="library-chip-count">{typeCounts.show}</span>
            </button>
          </div>
        </div>

        <label className="library-filter-group" htmlFor="library-tag-select">
          <span className="library-filter-label">Tag</span>
          <select
            id="library-tag-select"
            className="library-select"
            value={tagFilter}
            onChange={(event) => onTagFilterChange(event.target.value)}
          >
            <option value="">All Tags</option>
            {availableTags.map((tag) => (
              <option key={tag.label.toLowerCase()} value={tag.label}>
                {`${tag.label} (${tag.count})`}
              </option>
            ))}
          </select>
        </label>

        <label className="library-filter-group" htmlFor="library-order-select">
          <span className="library-filter-label">Order</span>
          <select
            id="library-order-select"
            className="library-select"
            value={sortOrder}
            onChange={(event) =>
              onSortOrderChange(event.target.value as MediaSortOrder)
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="library-stat-block" aria-live="polite">
        <span className="library-stat-value">{filteredCount.toLocaleString()}</span>
        <span className="library-stat-label">Titles Shown</span>
        {hasSearchOrTagFilter ? (
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
