import { useCallback, useMemo, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MediaTile } from "../components/MediaTile";
import { MediaLibraryFilterControls } from "../components/MediaLibraryFilterControls";
import type {
  MediaItem,
  ProgressEntry,
  User,
} from "../../shared/services/types";
import {
  LIBRARY_SEARCH_QUERY_PARAM,
  LIBRARY_SHELF_QUERY_PARAM,
  normalizeLibrarySearchTerm,
  parseLibraryFilterState,
  pickRandomItem,
  toLibraryPath,
  toRandomDetailsCandidates,
} from "../services/librarySearchUtils";
import type { MediaLibraryFilterState } from "../services/mediaLibraryFilterUtils";
import {
  artworkUrlForMedia,
  toLibraryItems,
  toProgressMap,
  toProgressPercent,
} from "../services/mediaLibraryUtils";
import { useMediaLibrary } from "../services/useMediaLibrary";
import { useMediaLibraryFilters } from "../services/useMediaLibraryFilters";
import { useRemoteLibrarySearch } from "../services/useRemoteLibrarySearch";
import { PhonePageHeader } from "../../navigation/components/PhonePageHeader";
import { PhonePageShell } from "../../navigation/components/PhonePageShell";

interface MediaLibraryPagePhoneProps {
  token: string;
  user: User;
  onLogout: () => void;
}

function PhoneLibraryResults(props: {
  items: MediaItem[];
  progressMap: Map<string, ProgressEntry>;
  activeSearchLabel: string;
  hasSearchOrTagFilter: boolean;
  onOpen: (id: string) => void;
  onReset: () => void;
  onClear: () => void;
}) {
  const gridClass =
    props.items.length < 6
      ? "library-grid is-compact phone-library-grid"
      : "library-grid phone-library-grid";
  return (
    <section className="browse-section library-results phone-library-results">
      <div className="section-heading-row">
        <h2 className="section-title">All Media</h2>
        <p className="section-subtitle">{props.activeSearchLabel}</p>
      </div>
      {props.items.length > 0 ? (
        <div className={gridClass}>
          {props.items.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              progressPercent={toProgressPercent(
                props.progressMap.get(item.id),
              )}
              progressKind="watch"
              layout="library"
              onOpen={props.onOpen}
            />
          ))}
        </div>
      ) : (
        <article className="library-empty">
          <h2>No titles match this filter</h2>
          <p>
            Try broadening type, tag, watch, quality, runtime, artwork, format,
            or order filters.
          </p>
          <div className="library-empty-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={props.onReset}
            >
              Reset Filters
            </button>
            {props.hasSearchOrTagFilter ? (
              <button
                type="button"
                className="ghost-button"
                onClick={props.onClear}
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        </article>
      )}
    </section>
  );
}

function PhoneRemoteResults(props: {
  active: boolean;
  items: MediaItem[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
}) {
  if (!props.active) return null;
  const ready = !props.loading && !props.error;
  const gridClass =
    props.items.length < 6
      ? "library-grid is-compact phone-library-grid"
      : "library-grid phone-library-grid";
  return (
    <section className="browse-section library-results library-remote-results phone-library-results">
      <div className="section-heading-row">
        <h2 className="section-title">Outside Your Library</h2>
        <p className="section-subtitle">
          Matching titles from TMDB and Jikan that are not indexed locally.
        </p>
      </div>
      {props.error ? (
        <p className="error-text library-feedback">{props.error}</p>
      ) : null}
      {props.loading ? (
        <p className="muted library-feedback">
          Searching external media catalogs...
        </p>
      ) : null}
      {ready && props.items.length > 0 ? (
        <div className={gridClass}>
          {props.items.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              layout="library"
              onOpen={props.onOpen}
            />
          ))}
        </div>
      ) : null}
      {ready && props.items.length === 0 ? (
        <article className="library-empty library-empty-remote">
          <h2>No external matches yet</h2>
          <p>
            Try a broader title or fewer filters to discover media outside your
            local index.
          </p>
        </article>
      ) : null}
    </section>
  );
}

export function MediaLibraryPagePhone({
  token,
  user,
  onLogout,
}: MediaLibraryPagePhoneProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchParamString = searchParams.toString();
  const routeSearchTerm = normalizeLibrarySearchTerm(
    searchParams.get(LIBRARY_SEARCH_QUERY_PARAM),
  );
  const routeShelf = searchParams.get(LIBRARY_SHELF_QUERY_PARAM);
  const routeFilters = useMemo(
    () => parseLibraryFilterState(new URLSearchParams(searchParamString)),
    [searchParamString],
  );

  const updateLibraryRouteFilters = useCallback(
    (nextFilters: MediaLibraryFilterState) => {
      navigate(
        toLibraryPath({
          q: routeSearchTerm,
          filters: nextFilters,
          shelf: routeShelf,
        }),
        { replace: true },
      );
    },
    [navigate, routeSearchTerm, routeShelf],
  );

  const { mediaItems, progressItems, loading, error, activeSearch } =
    useMediaLibrary(token, routeSearchTerm);

  const libraryItems = useMemo(() => toLibraryItems(mediaItems), [mediaItems]);

  const {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
    watchStatusFilter,
    setWatchStatusFilter,
    subtitleAvailabilityFilter,
    setSubtitleAvailabilityFilter,
    qualityFilter,
    setQualityFilter,
    runtimeFilter,
    setRuntimeFilter,
    releaseYearFilter,
    setReleaseYearFilter,
    artworkFilter,
    setArtworkFilter,
    chapterFilter,
    setChapterFilter,
    formatFilter,
    setFormatFilter,
    videoCodecFilter,
    setVideoCodecFilter,
    sortOrder,
    setSortOrder,
    filterState,
    typeCounts,
    availableTags,
    filteredItems,
    activeSearchLabel,
    hasSearchOrTagFilter,
    resetFilters,
  } = useMediaLibraryFilters({
    routeSearchTerm,
    routeFilters,
    activeSearch: activeSearch ?? null,
    libraryItems,
    progressItems,
    onFilterStateChange: updateLibraryRouteFilters,
  });

  const { remoteItems, remoteLoading, remoteError } = useRemoteLibrarySearch({
    token,
    activeSearch: activeSearch ?? null,
    manageMode: false,
  });

  const openDetails = useCallback(
    (mediaId: string) => {
      navigate(`/details/${mediaId}`);
    },
    [navigate],
  );

  const randomDetailsCandidates = useMemo(
    () => toRandomDetailsCandidates(mediaItems),
    [mediaItems],
  );

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(randomDetailsCandidates);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [openDetails, randomDetailsCandidates]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(
      toLibraryPath({ q: query, filters: filterState, shelf: routeShelf }),
    );
  }

  function handleClearSearch() {
    setQuery("");
    resetFilters();
    navigate("/library");
  }

  function handleResetFilters() {
    resetFilters();
    navigate("/library");
  }

  const progressMap = useMemo(
    () => toProgressMap(progressItems),
    [progressItems],
  );

  return (
    <PhonePageShell pageKey="library">
      <main className="browse-page media-library-page phone-library-page">
        <PhonePageHeader
          user={user}
          onLogout={onLogout}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearch}
          onOpenRandomDetails={openRandomDetails}
          randomDisabled={randomDetailsCandidates.length === 0}
        />

        <section
          className="library-toolbar phone-library-toolbar"
          aria-label="Library filters"
        >
          <MediaLibraryFilterControls
            idPrefix="library-phone"
            typeFilter={typeFilter}
            typeCounts={typeCounts}
            tagFilter={tagFilter}
            availableTags={availableTags}
            watchStatusFilter={watchStatusFilter}
            subtitleAvailabilityFilter={subtitleAvailabilityFilter}
            qualityFilter={qualityFilter}
            runtimeFilter={runtimeFilter}
            releaseYearFilter={releaseYearFilter}
            artworkFilter={artworkFilter}
            chapterFilter={chapterFilter}
            formatFilter={formatFilter}
            videoCodecFilter={videoCodecFilter}
            sortOrder={sortOrder}
            setTypeFilter={setTypeFilter}
            setTagFilter={setTagFilter}
            setWatchStatusFilter={setWatchStatusFilter}
            setSubtitleAvailabilityFilter={setSubtitleAvailabilityFilter}
            setQualityFilter={setQualityFilter}
            setRuntimeFilter={setRuntimeFilter}
            setReleaseYearFilter={setReleaseYearFilter}
            setArtworkFilter={setArtworkFilter}
            setChapterFilter={setChapterFilter}
            setFormatFilter={setFormatFilter}
            setVideoCodecFilter={setVideoCodecFilter}
            setSortOrder={setSortOrder}
          />

          <div
            className="library-stat-block phone-library-stat-block"
            aria-live="polite"
          >
            <div className="phone-library-stat-summary">
              <span className="library-stat-value">
                {filteredItems.length.toLocaleString()}
              </span>
              <span className="library-stat-label">Titles shown</span>
            </div>
            <div className="phone-library-stat-actions">
              {hasSearchOrTagFilter ? (
                <button
                  type="button"
                  className="library-clear-button"
                  onClick={handleClearSearch}
                >
                  Clear Filters
                </button>
              ) : null}
              <button
                type="button"
                className="library-clear-button"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {error ? <p className="error-text library-feedback">{error}</p> : null}
        {loading ? (
          <p className="muted library-feedback">Loading media library...</p>
        ) : null}

        <PhoneLibraryResults
          items={filteredItems}
          progressMap={progressMap}
          activeSearchLabel={activeSearchLabel}
          hasSearchOrTagFilter={hasSearchOrTagFilter}
          onOpen={openDetails}
          onReset={handleResetFilters}
          onClear={handleClearSearch}
        />
        <PhoneRemoteResults
          active={Boolean(activeSearch)}
          items={remoteItems}
          loading={remoteLoading}
          error={remoteError}
          onOpen={openDetails}
        />
      </main>
    </PhonePageShell>
  );
}
