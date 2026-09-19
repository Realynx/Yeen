import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AssignToShowDialog } from '../../media-management/components/AssignToShowDialog';
import { DeleteMediaDialog } from '../../media-management/components/DeleteMediaDialog';
import { EditMetadataDialog } from '../../media-management/components/EditMetadataDialog';
import { LibraryManageBar } from '../components/LibraryManageBar';
import { MediaLibraryTopNav } from '../components/MediaLibraryTopNav';
import { StorageUsageMeter } from '../components/StorageUsageMeter';
import { type BulkDeleteMediaResult } from '../../shared/services/api';
import type { MediaItem, User } from '../../shared/services/types';
import {
  LIBRARY_SEARCH_QUERY_PARAM,
  LIBRARY_SHELF_QUERY_PARAM,
  normalizeLibrarySearchTerm,
  parseLibraryFilterState,
  pickRandomItem,
  toLibraryPath,
  toRandomDetailsCandidates,
} from '../services/librarySearchUtils';
import type { MediaLibraryFilterState } from '../services/mediaLibraryFilterUtils';
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
import { useClientExperience } from '../../navigation/services/clientExperience';
import { useMediaStorageSummary } from '../services/useMediaStorageSummary';

interface MediaLibraryPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

function LibraryFeedback({ error, manageError, loading }: {
  error: string | null; manageError: string | null; loading: boolean;
}) {
  return (
    <>
      {error ? <p className="error-text library-feedback">{error}</p> : null}
      {manageError ? <p className="error-text library-feedback">{manageError}</p> : null}
      {loading ? <p className="muted library-feedback">Loading media library...</p> : null}
    </>
  );
}

export function MediaLibraryPage({ token, user, onLogout }: MediaLibraryPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const experience = useClientExperience();
  const searchParamString = searchParams.toString();
  const routeSearchTerm = normalizeLibrarySearchTerm(
    searchParams.get(LIBRARY_SEARCH_QUERY_PARAM),
  );
  const routeShelf = searchParams.get(LIBRARY_SHELF_QUERY_PARAM);
  const routeFilters = useMemo(
    () => parseLibraryFilterState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );

  const {
    mediaItems,
    progressItems,
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

  const updateLibraryRouteFilters = useCallback((nextFilters: MediaLibraryFilterState) => {
    navigate(toLibraryPath({
      q: routeSearchTerm,
      filters: nextFilters,
      shelf: routeShelf,
    }), { replace: true });
  }, [navigate, routeSearchTerm, routeShelf]);

  const libraryFilters = useMediaLibraryFilters({
    routeSearchTerm,
    routeFilters,
    activeSearch: activeSearchTerm,
    libraryItems,
    progressItems,
    onFilterStateChange: updateLibraryRouteFilters,
  });
  const {
    query,
    setQuery,
    filteredItems,
    activeSearchLabel,
    hasSearchOrTagFilter,
    resetFilters,
  } = libraryFilters;

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
    navigate(toLibraryPath({
      q: query,
      filters: libraryFilters.filterState,
      shelf: routeShelf,
    }));
  }

  useEffect(() => {
    if (experience === 'tv') {
      return;
    }

    const normalizedQuery = normalizeLibrarySearchTerm(query);
    if (normalizedQuery === routeSearchTerm) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate(toLibraryPath({
        q: normalizedQuery,
        filters: libraryFilters.filterState,
        shelf: routeShelf,
      }), { replace: true });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [experience, libraryFilters.filterState, navigate, query, routeSearchTerm, routeShelf]);

  function handleClearSearch() { setQuery(''); resetFilters(); navigate('/library'); }

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
      <MediaLibraryTopNav
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={handleSearch}
        onOpenRandomDetails={openRandomDetails}
        hasRandomDetailsCandidate={hasRandomDetailsCandidate}
        user={user}
        onLogout={onLogout}
      />

      <StorageUsageMeter
        className="library-storage-meter"
        summary={storageSummary}
        loading={storageSummaryLoading}
        error={storageSummaryError}
        title="Library Storage"
      />

      <MediaLibraryToolbar
        filters={libraryFilters}
        collapsible={experience === 'tv'}
        isAdmin={isAdmin}
        manageMode={manageMode}
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

      <LibraryFeedback error={error} manageError={visibleManageActionError} loading={loading} />

      <MediaLibraryLocalResultsSection
        hidden={hideLocalSearchEmptyState}
        filteredItems={filteredItems}
        activeSearchLabel={activeSearchLabel}
        useCompactResultsGrid={useCompactResultsGrid}
        manageMode={manageMode}
        selectedIds={selectedIds}
        progressMap={progressMap}
        hasSearchOrTagFilter={hasSearchOrTagFilter}
        onOpenDetails={openDetails}
        onToggleSelection={toggleSelection}
        onResetFilters={handleClearSearch}
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
