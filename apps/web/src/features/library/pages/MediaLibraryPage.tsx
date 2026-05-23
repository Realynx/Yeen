import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { AssignToShowDialog } from '../../media-management/components/AssignToShowDialog';
import { DeleteMediaDialog } from '../../media-management/components/DeleteMediaDialog';
import { EditMetadataDialog } from '../../media-management/components/EditMetadataDialog';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { LibraryManageBar } from '../components/LibraryManageBar';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import { StorageUsageMeter } from '../components/StorageUsageMeter';
import {
  type BulkDeleteMediaResult,
} from '../../shared/services/api';
import type { MediaItem, User } from '../../shared/services/types';
import {
  LIBRARY_SEARCH_QUERY_PARAM,
  normalizeLibrarySearchTerm,
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../services/librarySearchUtils';
import {
  toLibraryItemGroups,
  toProgressMap,
} from '../services/mediaLibraryUtils';
import { MediaLibraryLocalResultsSection } from '../components/MediaLibraryLocalResultsSection';
import { MediaLibraryRemoteResultsSection } from '../components/MediaLibraryRemoteResultsSection';
import { MediaLibraryToolbar } from '../components/MediaLibraryToolbar';
import { useMediaLibraryFilters } from '../services/useMediaLibraryFilters';
import { useRemoteLibrarySearch } from '../services/useRemoteLibrarySearch';
import { useSelectedLibraryItems } from '../services/useSelectedLibraryItems';
import { useMediaLibrary } from '../services/useMediaLibrary';
import { useMediaSelection } from '../services/useMediaSelection';
import { useMediaStorageSummary } from '../services/useMediaStorageSummary';

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
  const activeSearchTerm = activeSearch ?? null;

  const libraryItemGroups = useMemo(
    () => toLibraryItemGroups(mediaItems),
    [mediaItems],
  );

  const libraryItems = useMemo(
    () => libraryItemGroups.map((group) => group.item),
    [libraryItemGroups],
  );

  const {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
    sortOrder,
    setSortOrder,
    typeCounts,
    availableTags,
    filteredItems,
    activeSearchLabel,
    hasSearchOrTagFilter,
    resetFilters,
  } = useMediaLibraryFilters({
    routeSearchTerm,
    activeSearch: activeSearchTerm,
    libraryItems,
  });

  const {
    summary: storageSummary,
    loading: storageSummaryLoading,
    error: storageSummaryError,
  } = useMediaStorageSummary(token);

  const isAdmin = user.role === 'admin';
  const [manageMode, setManageMode] = useState(false);
  const { selectedIds, visibleIdsRef, toggleSelection, clearSelection, selectAllVisible } =
    useMediaSelection();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [manageActionError, setManageActionError] = useState<string | null>(null);

  const {
    remoteItems,
    remoteLoading,
    remoteError,
  } = useRemoteLibrarySearch({
    token,
    activeSearch: activeSearchTerm,
    manageMode,
  });

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
    resetFilters();
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

  const {
    selectedMediaItems,
    hasSeriesAssignmentConflict,
  } = useSelectedLibraryItems({
    libraryItemGroups,
    selectedIds,
  });

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

  const visibleManageActionError = hasSeriesAssignmentConflict
    ? manageActionError
    : null;

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

  const hideLocalSearchEmptyState =
    !manageMode &&
    Boolean(activeSearchTerm) &&
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

      <StorageUsageMeter
        className="library-storage-meter"
        summary={storageSummary}
        loading={storageSummaryLoading}
        error={storageSummaryError}
        title="Library Storage"
      />

      <MediaLibraryToolbar
        filteredCount={filteredItems.length}
        typeFilter={typeFilter}
        typeCounts={typeCounts}
        tagFilter={tagFilter}
        availableTags={availableTags}
        sortOrder={sortOrder}
        hasSearchOrTagFilter={hasSearchOrTagFilter}
        isAdmin={isAdmin}
        manageMode={manageMode}
        onTypeFilterChange={setTypeFilter}
        onTagFilterChange={setTagFilter}
        onSortOrderChange={setSortOrder}
        onClearSearch={handleClearSearch}
        onToggleManageMode={toggleManageMode}
      />

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
      {visibleManageActionError ? (
        <p className="error-text library-feedback">{visibleManageActionError}</p>
      ) : null}
      {loading ? <p className="muted library-feedback">Loading media library...</p> : null}

      <MediaLibraryLocalResultsSection
        hidden={hideLocalSearchEmptyState}
        filteredItems={filteredItems}
        activeSearchLabel={activeSearchLabel}
        useCompactResultsGrid={useCompactResultsGrid}
        manageMode={manageMode}
        selectedIds={selectedIds}
        progressMap={progressMap}
        downloadProgressMap={downloadProgressMap}
        hasSearchOrTagFilter={hasSearchOrTagFilter}
        onOpenDetails={openDetails}
        onToggleSelection={toggleSelection}
        onResetFilters={handleResetFilters}
        onClearFilters={handleClearSearch}
      />

      <MediaLibraryRemoteResultsSection
        activeSearch={activeSearchTerm}
        manageMode={manageMode}
        remoteError={remoteError}
        remoteLoading={remoteLoading}
        remoteItems={remoteItems}
        onOpenDetails={openDetails}
      />

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
