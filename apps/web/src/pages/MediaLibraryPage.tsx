import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { AssignToShowDialog } from '../components/AssignToShowDialog';
import { DeleteMediaDialog } from '../components/DeleteMediaDialog';
import { EditMetadataDialog } from '../components/EditMetadataDialog';
import { LibrarySearchForm } from '../components/LibrarySearchForm';
import { LibraryManageBar } from '../components/LibraryManageBar';
import { MediaTile } from '../components/MediaTile';
import { ProfileMenu } from '../components/ProfileMenu';
import {
  searchRemoteMedia,
  toApiErrorMessage,
  type BulkDeleteMediaResult,
} from '../lib/api';
import type { MediaItem, User } from '../lib/types';
import {
  LIBRARY_SEARCH_QUERY_PARAM,
  normalizeLibrarySearchTerm,
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from './librarySearchUtils';
import {
  SORT_OPTIONS,
  artworkUrlForMedia,
  normalizeTags,
  sortMediaItems,
  toLibraryItemGroups,
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
  const [searchParams] = useSearchParams();
  const routeSearchTerm = normalizeLibrarySearchTerm(
    searchParams.get(LIBRARY_SEARCH_QUERY_PARAM),
  );

  const [query, setQuery] = useState(routeSearchTerm);
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<MediaSortOrder>('updated-desc');

  const {
    mediaItems,
    progressItems,
    downloadProgressItems,
    loading,
    error,
    activeSearch,
    refresh,
    setError,
  } = useMediaLibrary(token, routeSearchTerm);

  useEffect(() => {
    setQuery(routeSearchTerm);
  }, [routeSearchTerm]);

  const isAdmin = user.role === 'admin';
  const [manageMode, setManageMode] = useState(false);
  const { selectedIds, visibleIdsRef, toggleSelection, clearSelection, selectAllVisible } =
    useMediaSelection();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [remoteItems, setRemoteItems] = useState<MediaItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [manageActionError, setManageActionError] = useState<string | null>(null);

  const openDetails = useCallback((mediaId: string) => {
    navigate(`/details/${mediaId}`);
  }, [navigate]);

  const randomDetailsCandidates = useMemo(
    () => toRandomDetailsCandidates(mediaItems),
    [mediaItems],
  );

  const hasRandomDetailsCandidate = randomDetailsCandidates.length > 0;

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(randomDetailsCandidates);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [openDetails, randomDetailsCandidates]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  function handleClearSearch() {
    setQuery('');
    setTagFilter('');
    navigate('/library');
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
        setManageActionError(null);
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

  const libraryItemGroups = useMemo(
    () => toLibraryItemGroups(mediaItems),
    [mediaItems],
  );

  const libraryItems = useMemo(
    () => libraryItemGroups.map((group) => group.item),
    [libraryItemGroups],
  );

  const libraryGroupById = useMemo(() => {
    const byId = new Map<string, (typeof libraryItemGroups)[number]>();
    for (const group of libraryItemGroups) {
      byId.set(group.item.id, group);
    }
    return byId;
  }, [libraryItemGroups]);

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
  const downloadProgressMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of downloadProgressItems) {
      const normalizedPercent = Math.min(100, Math.max(0, entry.progressPercent));
      map.set(entry.mediaId, normalizedPercent);
    }

    return map;
  }, [downloadProgressItems]);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteResults() {
      const searchTerm = activeSearch?.trim() ?? '';

      if (!searchTerm || manageMode) {
        setRemoteItems([]);
        setRemoteLoading(false);
        setRemoteError(null);
        return;
      }

      setRemoteLoading(true);
      setRemoteError(null);

      try {
        const payload = await searchRemoteMedia(token, searchTerm, 24);
        if (!cancelled) {
          setRemoteItems(payload.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRemoteItems([]);
          setRemoteError(
            toApiErrorMessage(loadError, 'Failed to search remote media catalogs.'),
          );
        }
      } finally {
        if (!cancelled) {
          setRemoteLoading(false);
        }
      }
    }

    void loadRemoteResults();

    return () => {
      cancelled = true;
    };
  }, [activeSearch, manageMode, token]);

  const activeSearchLabel = useMemo(() => {
    const searchLabel = activeSearch ? `matches for "${activeSearch}"` : null;
    const tagLabel = tagFilter ? `tag "${tagFilter}"` : null;

    if (searchLabel && tagLabel) return `Showing ${searchLabel} with ${tagLabel}`;
    if (searchLabel) return `Showing ${searchLabel}`;
    if (tagLabel) return `Showing items with ${tagLabel}`;
    return 'Showing all indexed media';
  }, [activeSearch, tagFilter]);

  const selectedMediaItems = useMemo(
    () => {
      const expanded: MediaItem[] = [];
      const seen = new Set<string>();

      for (const selectedId of selectedIds) {
        const group = libraryGroupById.get(selectedId);
        if (!group) {
          continue;
        }

        for (const item of group.sourceItems) {
          if (seen.has(item.id)) {
            continue;
          }

          seen.add(item.id);
          expanded.push(item);
        }
      }

      return expanded;
    },
    [libraryGroupById, selectedIds],
  );

  const selectedSeriesListingCount = useMemo(() => {
    let total = 0;

    for (const selectedId of selectedIds) {
      const group = libraryGroupById.get(selectedId);
      if (!group) {
        continue;
      }

      if (group.item.type !== 'show') {
        continue;
      }

      const hasPersistedSeriesRules = group.sourceItems.some((item) => {
        const rules = item.seriesAssignmentRules;
        if (!rules) {
          return false;
        }

        const keywordCount = Array.isArray(rules.keywordMappings)
          ? rules.keywordMappings.length
          : 0;
        const patternCount = Array.isArray(rules.patternMappings)
          ? rules.patternMappings.length
          : 0;

        return keywordCount > 0 || patternCount > 0;
      });

      if (group.sourceItems.length > 1 || hasPersistedSeriesRules) {
        total += 1;
      }
    }

    return total;
  }, [libraryGroupById, selectedIds]);

  const hasSeriesAssignmentConflict = selectedSeriesListingCount > 1;

  useEffect(() => {
    if (!hasSeriesAssignmentConflict) {
      setManageActionError(null);
    }
  }, [hasSeriesAssignmentConflict]);

  const openAssignDialog = useCallback(() => {
    if (hasSeriesAssignmentConflict) {
      setManageActionError(
        'Assign to Series can only target one existing series at a time. Deselect until one series listing remains selected.',
      );
      return;
    }

    setManageActionError(null);
    setShowAssignDialog(true);
  }, [hasSeriesAssignmentConflict]);

  const useCompactRemoteGrid = remoteItems.length > 0 && remoteItems.length < 6;
  const hideLocalSearchEmptyState =
    !manageMode &&
    Boolean(activeSearch) &&
    !loading &&
    !error &&
    mediaItems.length === 0;

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
            <NavLink
              className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
              to="/explore"
            >
              Explore
            </NavLink>
          </nav>
        </div>

        <div className="top-nav-right">
          <LibrarySearchForm
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearch}
            placeholder="Search titles and paths"
            onOpenRandomDetails={openRandomDetails}
            randomDisabled={!hasRandomDetailsCandidate}
          />
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
          onAssign={openAssignDialog}
          onDelete={() => setShowDeleteDialog(true)}
        />
      ) : null}

      {error ? <p className="error-text library-feedback">{error}</p> : null}
      {manageActionError ? (
        <p className="error-text library-feedback">{manageActionError}</p>
      ) : null}
      {loading ? <p className="muted library-feedback">Loading media library...</p> : null}

      {!hideLocalSearchEmptyState ? (
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
                    onOpen={openDetails}
                    selectable={manageMode}
                    selected={selectedIds.has(item.id)}
                    onSelectionToggle={toggleSelection}
                  />
                );
              })}
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
      ) : null}

      {activeSearch && !manageMode ? (
        <section className="browse-section library-results library-remote-results">
          <div className="section-heading-row">
            <h2 className="section-title">Outside Your Library</h2>
            <p className="section-subtitle">
              Matching titles from TMDB and Jikan that are not indexed locally.
            </p>
          </div>

          {remoteError ? <p className="error-text library-feedback">{remoteError}</p> : null}
          {remoteLoading ? (
            <p className="muted library-feedback">Searching external media catalogs...</p>
          ) : null}

          {!remoteLoading && !remoteError && remoteItems.length > 0 ? (
            <div className={useCompactRemoteGrid ? 'library-grid is-compact' : 'library-grid'}>
              {remoteItems.map((item) => (
                <MediaTile
                  key={item.id}
                  media={item}
                  imageUrl={artworkUrlForMedia(item)}
                  layout="library"
                  onOpen={openDetails}
                />
              ))}
            </div>
          ) : null}

          {!remoteLoading && !remoteError && remoteItems.length === 0 ? (
            <article className="library-empty library-empty-remote">
              <h2>No external matches yet</h2>
              <p>
                Try a broader title or fewer filters to discover media outside your local index.
              </p>
            </article>
          ) : null}
        </section>
      ) : null}

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
