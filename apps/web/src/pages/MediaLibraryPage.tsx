import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AssignToShowDialog } from '../components/AssignToShowDialog';
import { DeleteMediaDialog } from '../components/DeleteMediaDialog';
import { EditMetadataDialog } from '../components/EditMetadataDialog';
import { LibraryManageBar } from '../components/LibraryManageBar';
import { MediaTile } from '../components/MediaTile';
import { ProfileMenu } from '../components/ProfileMenu';
import type { BulkDeleteMediaResult } from '../lib/api';
import type { MediaItem, User } from '../lib/types';
import {
  SORT_OPTIONS,
  artworkUrlForMedia,
  normalizeTags,
  sortMediaItems,
  toLibraryItems,
  toLibraryType,
  toProgressMap,
  toProgressPercent,
} from './mediaLibraryUtils';
import type { MediaSortOrder, MediaTypeFilter } from './mediaLibraryUtils';
import { useMediaLibrary } from './useMediaLibrary';
import { useMediaSelection } from './useMediaSelection';

interface MediaLibraryPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function MediaLibraryPage({ token, user, onLogout }: MediaLibraryPageProps) {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<MediaSortOrder>('updated-desc');

  const { mediaItems, progressItems, loading, error, activeSearch, load, refresh, setError } =
    useMediaLibrary(token);

  const isAdmin = user.role === 'admin';
  const [manageMode, setManageMode] = useState(false);
  const { selectedIds, visibleIdsRef, toggleSelection, clearSelection, selectAllVisible } =
    useMediaSelection();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);

  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(query);
  }

  function handleClearSearch() {
    setQuery('');
    setTagFilter('');
    void load();
  }

  function handleResetFilters() {
    setTypeFilter('all');
    setTagFilter('');
    setSortOrder('updated-desc');
  }

  const toggleManageMode = useCallback(() => {
    setManageMode((value) => {
      if (value) {
        clearSelection();
        setShowAssignDialog(false);
        setShowDeleteDialog(false);
      }
      return !value;
    });
  }, [clearSelection]);

  const handlePermanentDeleteComplete = useCallback(
    (result: BulkDeleteMediaResult) => {
      setShowDeleteDialog(false);
      clearSelection();

      if (result.failed > 0) {
        setError(
          `Deleted ${result.deleted} of ${result.requested} selected items. ${result.failed} failed to delete.`,
        );
      } else {
        setError(null);
      }

      void refresh();
    },
    [clearSelection, refresh, setError],
  );

  const libraryItems = useMemo(
    () => (manageMode ? mediaItems : toLibraryItems(mediaItems)),
    [manageMode, mediaItems],
  );

  const typeCounts = useMemo(() => {
    let movie = 0;
    let show = 0;

    for (const item of libraryItems) {
      if (toLibraryType(item) === 'movie') movie += 1;
      if (toLibraryType(item) === 'show') show += 1;
    }

    return { all: libraryItems.length, movie, show };
  }, [libraryItems]);

  const availableTags = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();

    for (const item of libraryItems) {
      for (const tag of normalizeTags(item.tags)) {
        const key = tag.toLowerCase();
        const existing = counts.get(key);

        if (existing) {
          existing.count += 1;
          continue;
        }

        counts.set(key, { label: tag, count: 1 });
      }
    }

    return [...counts.values()].sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label, undefined, {
        sensitivity: 'base',
      });
    });
  }, [libraryItems]);

  const filteredItems = useMemo(() => {
    const byType =
      typeFilter === 'all'
        ? libraryItems
        : libraryItems.filter((item) => toLibraryType(item) === typeFilter);

    const normalizedTagFilter = tagFilter.trim().toLowerCase();
    const byTag = normalizedTagFilter
      ? byType.filter((item) =>
          item.tags.some((tag) => tag.trim().toLowerCase() === normalizedTagFilter),
        )
      : byType;

    return sortMediaItems(byTag, sortOrder);
  }, [libraryItems, sortOrder, tagFilter, typeFilter]);

  const useCompactResultsGrid = filteredItems.length > 0 && filteredItems.length < 6;

  useEffect(() => {
    visibleIdsRef.current = filteredItems.map((item) => item.id);
  }, [filteredItems, visibleIdsRef]);

  const progressMap = useMemo(() => toProgressMap(progressItems), [progressItems]);

  const activeSearchLabel = useMemo(() => {
    const searchLabel = activeSearch ? `matches for "${activeSearch}"` : null;
    const tagLabel = tagFilter ? `tag "${tagFilter}"` : null;

    if (searchLabel && tagLabel) return `Showing ${searchLabel} with ${tagLabel}`;
    if (searchLabel) return `Showing ${searchLabel}`;
    if (tagLabel) return `Showing items with ${tagLabel}`;
    return 'Showing all indexed media';
  }, [activeSearch, tagFilter]);

  const selectedMediaItems = useMemo(
    () => mediaItems.filter((item) => selectedIds.has(item.id)),
    [mediaItems, selectedIds],
  );

  return (
    <main className="browse-page media-library-page">
      <header className="top-nav">
        <div className="top-nav-left">
          <p className="brand-mark">YEEN</p>
          <nav className="browse-links" aria-label="Browse">
            <NavLink
              className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
              end
              to="/"
            >
              Home
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
              to="/library"
            >
              Library
            </NavLink>
          </nav>
        </div>

        <div className="top-nav-right">
          <form className="search-row" onSubmit={handleSearch}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and paths"
              aria-label="Search media"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <button type="submit">Search</button>
          </form>
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <section className="library-toolbar" aria-label="Library filters and order options">
        <div className="library-filters">
          <div className="library-filter-group">
            <p className="library-filter-label">Media Type</p>
            <div className="library-chip-row" role="group" aria-label="Filter by media type">
              <button
                type="button"
                className={typeFilter === 'all' ? 'library-chip is-active' : 'library-chip'}
                onClick={() => setTypeFilter('all')}
              >
                All
                <span className="library-chip-count">{typeCounts.all}</span>
              </button>
              <button
                type="button"
                className={typeFilter === 'movie' ? 'library-chip is-active' : 'library-chip'}
                onClick={() => setTypeFilter('movie')}
              >
                Movies
                <span className="library-chip-count">{typeCounts.movie}</span>
              </button>
              <button
                type="button"
                className={typeFilter === 'show' ? 'library-chip is-active' : 'library-chip'}
                onClick={() => setTypeFilter('show')}
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
              onChange={(event) => setTagFilter(event.target.value)}
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
              onChange={(event) => setSortOrder(event.target.value as MediaSortOrder)}
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
          <span className="library-stat-value">{filteredItems.length.toLocaleString()}</span>
          <span className="library-stat-label">Titles Shown</span>
          {activeSearch || tagFilter ? (
            <button
              type="button"
              className="library-clear-button"
              onClick={handleClearSearch}
            >
              Clear Filters
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className={manageMode ? 'library-clear-button is-active' : 'library-clear-button'}
              onClick={toggleManageMode}
            >
              {manageMode ? 'Exit Manage' : 'Manage'}
            </button>
          ) : null}
        </div>
      </section>

      {manageMode ? (
        <LibraryManageBar
          selectedCount={selectedIds.size}
          filteredCount={filteredItems.length}
          filteredItems={filteredItems}
          selectedIds={selectedIds}
          onClearSelection={clearSelection}
          onSelectAllVisible={selectAllVisible}
          onEditSingle={setEditingMedia}
          mediaItems={mediaItems}
          onAssign={() => setShowAssignDialog(true)}
          onDelete={() => setShowDeleteDialog(true)}
        />
      ) : null}

      {error ? <p className="error-text library-feedback">{error}</p> : null}
      {loading ? <p className="muted library-feedback">Loading media library...</p> : null}

      <section className="browse-section library-results">
        <div className="section-heading-row">
          <h1 className="section-title">All Media</h1>
          <p className="section-subtitle">{activeSearchLabel}</p>
        </div>

        {filteredItems.length > 0 ? (
          <div className={useCompactResultsGrid ? 'library-grid is-compact' : 'library-grid'}>
            {filteredItems.map((item) => (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                progressPercent={toProgressPercent(progressMap.get(item.id))}
                onOpen={openDetails}
                selectable={manageMode}
                selected={selectedIds.has(item.id)}
                onSelectionToggle={toggleSelection}
              />
            ))}
          </div>
        ) : (
          <article className="library-empty">
            <h2>No titles match this filter</h2>
            <p>
              Try switching the media type, tag, or order settings.
            </p>
            <div className="library-empty-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
              {activeSearch || tagFilter ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleClearSearch}
                >
                  Clear Filters
                </button>
              ) : null}
            </div>
          </article>
        )}
      </section>

      {showAssignDialog && manageMode ? (
        <AssignToShowDialog
          token={token}
          selectedItems={selectedMediaItems}
          onClose={() => setShowAssignDialog(false)}
          onAssigned={() => {
            setShowAssignDialog(false);
            clearSelection();
            setManageMode(false);
            void refresh();
          }}
        />
      ) : null}

      {showDeleteDialog && manageMode ? (
        <DeleteMediaDialog
          token={token}
          selectedItems={selectedMediaItems}
          onClose={() => setShowDeleteDialog(false)}
          onDeleted={handlePermanentDeleteComplete}
        />
      ) : null}

      {editingMedia ? (
        <EditMetadataDialog
          token={token}
          media={editingMedia}
          onClose={() => setEditingMedia(null)}
          onSaved={() => {
            setEditingMedia(null);
            void refresh();
          }}
        />
      ) : null}
    </main>
  );
}
