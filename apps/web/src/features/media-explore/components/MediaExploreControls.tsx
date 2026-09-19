import { useState } from 'react';
import {
  type ExploreCatalogMode,
  type ExploreTypeFilter,
} from '../services/exploreCatalog';
import type { ExploreTypeCounts } from '../services/exploreGrid';

interface MediaExploreControlsProps {
  catalogMode: ExploreCatalogMode;
  collapsible?: boolean;
  typeFilter: ExploreTypeFilter;
  typeCounts: ExploreTypeCounts;
  tagFilter: string;
  filteredCount: number;
  selectableTags: readonly string[];
  quickTags: readonly string[];
  onModeChange: (mode: ExploreCatalogMode) => void;
  onTypeFilterChange: (typeFilter: ExploreTypeFilter) => void;
  onTagSelect: (tag: string) => void;
  onQuickTag: (tag: string) => void;
  onClearTag: () => void;
  onResetExplore: () => void;
}

export function MediaExploreControls({
  catalogMode,
  collapsible = false,
  typeFilter,
  typeCounts,
  tagFilter,
  filteredCount,
  selectableTags,
  quickTags,
  onModeChange,
  onTypeFilterChange,
  onTagSelect,
  onQuickTag,
  onClearTag,
  onResetExplore,
}: MediaExploreControlsProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <section
      className={`library-toolbar${collapsible ? ' tv-explore-toolbar' : ''}${filtersOpen ? ' is-open' : ''}`}
      aria-label="Explore controls"
      data-tv-focus-zone="shelf"
    >
      {(!collapsible || filtersOpen) ? <div className="library-filters">
        <div className="library-filter-group">
          <p className="library-filter-label">Catalog</p>
          <div
            className="library-chip-row"
            role="group"
            aria-label="Select catalog type"
            data-tv-focus-lane-id="explore-catalog-filter"
          >
            <button
              type="button"
              className={
                catalogMode === 'non-anime' ? 'library-chip is-active' : 'library-chip'
              }
              onClick={() => onModeChange('non-anime')}
            >
              Non-Anime
            </button>
            <button
              type="button"
              className={catalogMode === 'anime' ? 'library-chip is-active' : 'library-chip'}
              onClick={() => onModeChange('anime')}
            >
              Anime
            </button>
          </div>
        </div>

        <div className="library-filter-group">
          <p className="library-filter-label">Type</p>
          <div
            className="library-chip-row"
            role="group"
            aria-label="Filter by media type"
            data-tv-focus-lane-id="explore-type-filter"
          >
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

        <label
          className="library-filter-group"
          htmlFor="explore-tag-select"
          data-tv-focus-lane-id="explore-tag-filter"
        >
          <span className="library-filter-label">Tag</span>
          <select
            id="explore-tag-select"
            className="library-select"
            value={tagFilter}
            onChange={(event) => {
              onTagSelect(event.target.value);
            }}
          >
            <option value="">Select Tag</option>
            {selectableTags.map((tag) => {
              return (
                <option key={tag.toLowerCase()} value={tag}>
                  {tag}
                </option>
              );
            })}
          </select>
        </label>

        <div className="library-filter-group">
          <p className="library-filter-label">Popular Tags</p>
          <div
            className="library-chip-row"
            role="group"
            aria-label="Quick tag searches"
            data-tv-focus-lane-id="explore-quick-tags"
          >
            {quickTags.map((tag) => {
              const isActiveTag = tagFilter.trim().toLowerCase() === tag.toLowerCase();

              return (
                <button
                  key={tag}
                  type="button"
                  className={isActiveTag ? 'library-chip is-active' : 'library-chip'}
                  onClick={() => onQuickTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div> : null}

      <div className="library-stat-block" aria-live="polite" data-tv-focus-lane-id="explore-toolbar-actions">
        <span className="library-stat-value">{filteredCount.toLocaleString()}</span>
        <span className="library-stat-label">Titles Shown</span>
        {collapsible ? (
          <button
            type="button"
            className="library-clear-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            {filtersOpen ? 'Hide Filters' : 'Filters'}
          </button>
        ) : null}
        {tagFilter ? (
          <button
            type="button"
            className="library-clear-button"
            onClick={onClearTag}
          >
            Clear Tag
          </button>
        ) : null}
        <button type="button" className="library-clear-button" onClick={onResetExplore}>
          Reset Explore
        </button>
      </div>
    </section>
  );
}
