import {
  type ExploreCatalogMode,
  type ExploreTypeFilter,
} from './exploreCatalog';
import type { ExploreTypeCounts } from './exploreGrid';

interface MediaExploreControlsProps {
  catalogMode: ExploreCatalogMode;
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
  return (
    <section className="library-toolbar" aria-label="Explore controls">
      <div className="library-filters">
        <div className="library-filter-group">
          <p className="library-filter-label">Catalog</p>
          <div className="library-chip-row" role="group" aria-label="Select catalog type">
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

        <label className="library-filter-group" htmlFor="explore-tag-select">
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
          <div className="library-chip-row" role="group" aria-label="Quick tag searches">
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
      </div>

      <div className="library-stat-block" aria-live="polite">
        <span className="library-stat-value">{filteredCount.toLocaleString()}</span>
        <span className="library-stat-label">Titles Shown</span>
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
