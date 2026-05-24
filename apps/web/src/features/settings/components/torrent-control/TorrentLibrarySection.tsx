import type { TorrentStateCategoryGroup, TorrentStateCategoryKey } from './torrentControlUtils';
import { TorrentControlActionIcon } from './TorrentControlActionIcon';
import { TorrentLibraryGroups } from './TorrentLibraryGroups';
import { TorrentPanelSection } from './TorrentPanelSection';

interface TorrentLibrarySectionProps {
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  adding: boolean;
  isBusy: boolean;
  hasSelection: boolean;
  searchActive: boolean;
  searchQuery: string;
  selectedCount: number;
  filteredTorrentCount: number;
  totalTorrentCount: number;
  groupCount: number;
  visibleHashesLength: number;
  allVisibleSelected: boolean;
  categorizedItems: TorrentStateCategoryGroup[];
  hiddenCategories: Partial<Record<TorrentStateCategoryKey, boolean>>;
  selectedHashSet: Set<string>;
  onSearchQueryChange: (value: string) => void;
  onToggleVisibleSelection: () => void;
  onClearSelection: () => void;
  onStartSelected: () => void;
  onStopSelected: () => void;
  onRestartSelected: () => void;
  onSequentialSelected: () => void;
  onRandomSelected: () => void;
  onDeleteSelected: () => void;
  onToggleCategory: (key: TorrentStateCategoryKey) => void;
  onToggleSelection: (hash: string, shiftKey: boolean) => void;
}

export function TorrentLibrarySection({
  isOpen,
  onToggle,
  loading,
  adding,
  isBusy,
  hasSelection,
  searchActive,
  searchQuery,
  selectedCount,
  filteredTorrentCount,
  totalTorrentCount,
  groupCount,
  visibleHashesLength,
  allVisibleSelected,
  categorizedItems,
  hiddenCategories,
  selectedHashSet,
  onSearchQueryChange,
  onToggleVisibleSelection,
  onClearSelection,
  onStartSelected,
  onStopSelected,
  onRestartSelected,
  onSequentialSelected,
  onRandomSelected,
  onDeleteSelected,
  onToggleCategory,
  onToggleSelection,
}: TorrentLibrarySectionProps) {
  return (
    <TorrentPanelSection
      id="download-torrent-library"
      kicker="Torrent Library"
      title="Torrents By Status"
      description="Search torrents, run batch controls, and expand status groups when needed."
      badge={`${filteredTorrentCount} shown / ${totalTorrentCount} torrents / ${groupCount} groups`}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {loading ? <p className="muted">Loading torrents...</p> : null}

      {!loading && totalTorrentCount === 0 ? (
        <p className="muted">No torrents reported by qBittorrent.</p>
      ) : null}

      {!loading && totalTorrentCount > 0 ? (
        <section className="torrent-control-toolbar" aria-label="Torrent library controls">
          <div className="torrent-control-toolbar-head">
            <p className="torrent-control-selection-summary">
              Selected {selectedCount} of {filteredTorrentCount} shown ({totalTorrentCount} total)
            </p>
            <p className="torrent-control-selection-hint muted">
              Click a row to select. Shift+click selects a range.
            </p>
          </div>

          <label className="settings-field settings-field-wide torrent-control-search-field">
            <span className="settings-field-label">Search Torrents</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search by name, hash, or status"
            />
          </label>

          <div className="settings-actions-row torrent-control-selection-actions">
            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onToggleVisibleSelection}
              disabled={isBusy || adding || visibleHashesLength === 0}
            >
              <TorrentControlActionIcon
                name={allVisibleSelected ? 'clear' : 'selectVisible'}
              />
              <span>{allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onClearSelection}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="clear" />
              <span>Clear Selection</span>
            </button>
          </div>

          <div className="settings-actions-row torrent-control-batch-actions">
            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onStartSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="start" />
              <span>Start</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onStopSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="stop" />
              <span>Stop</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onRestartSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="restart" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onSequentialSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="sequential" />
              <span>In Order</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onRandomSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="random" />
              <span>Random</span>
            </button>

            <button
              type="button"
              className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
              onClick={onDeleteSelected}
              disabled={isBusy || adding || !hasSelection}
            >
              <TorrentControlActionIcon name="delete" />
              <span>Delete</span>
            </button>
          </div>
        </section>
      ) : null}

      {!loading && totalTorrentCount > 0 && filteredTorrentCount === 0 ? (
        <p className="muted torrent-control-empty-search">
          No torrents match "{searchQuery.trim()}".
        </p>
      ) : null}

      {!loading && filteredTorrentCount > 0 ? (
        <TorrentLibraryGroups
          categorizedItems={categorizedItems}
          searchActive={searchActive}
          hiddenCategories={hiddenCategories}
          selectedHashSet={selectedHashSet}
          isBusy={isBusy}
          adding={adding}
          onToggleCategory={onToggleCategory}
          onToggleSelection={onToggleSelection}
        />
      ) : null}
    </TorrentPanelSection>
  );
}
