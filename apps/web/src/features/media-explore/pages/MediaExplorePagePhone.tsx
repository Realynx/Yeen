import { useCallback, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { MediaTile } from "../../library/components/MediaTile";
import type { MediaItem, User } from "../../shared/services/types";
import {
  pickRandomItem,
  toLibrarySearchPath,
} from "../../library/services/librarySearchUtils";
import { artworkUrlForMedia } from "../../library/services/mediaLibraryUtils";
import {
  EXPECTED_TAGS_BY_MODE,
  providerLabelForMode,
  QUICK_TAGS_BY_MODE,
  type ExploreCatalogMode,
} from "../services/exploreCatalog";
import {
  getExploreTypeCounts,
  getFilteredExploreItems,
  shouldUseCompactExploreGrid,
} from "../services/exploreGrid";
import { PhonePageHeader } from "../../navigation/components/PhonePageHeader";
import { PhonePageShell } from "../../navigation/components/PhonePageShell";
import { useExploreCatalogState } from "../services/useExploreCatalogState";
import { useExploreWindowLoadMoreSentinel } from "../services/useExploreWindowLoadMoreSentinel";

interface MediaExplorePagePhoneProps {
  token: string;
  user: User;
  onLogout: () => void;
}

const REMOTE_PAGE_SIZE = 20;

function exploreResultsReady(loading: boolean, error: string | null): boolean {
  return !loading && !error;
}

function exploreGridClass(compact: boolean): string {
  return compact
    ? "library-grid is-compact phone-explore-grid"
    : "library-grid phone-explore-grid";
}

function PhoneExploreEmpty({ hasMore }: { hasMore: boolean }) {
  return (
    <article className="library-empty library-empty-remote">
      <h2>{hasMore ? "No matching titles loaded yet" : "No results yet"}</h2>
      <p>
        {hasMore
          ? "More catalog pages are available. Keep scrolling to continue with this filter."
          : "Pick another tag or media type to continue exploring."}
      </p>
    </article>
  );
}

interface PhoneExploreResultsProps {
  items: MediaItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  compact: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  onOpen: (id: string) => void;
  onRetry: () => void;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
}

export function PhoneExploreResults({
  items,
  loading,
  loadingMore,
  error,
  hasMore,
  compact,
  sectionTitle,
  sectionSubtitle,
  onOpen,
  onRetry,
  loadMoreSentinelRef,
}: PhoneExploreResultsProps) {
  const ready = exploreResultsReady(loading, error);
  const gridClass = exploreGridClass(compact);
  return (
    <section className="library-section phone-explore-results">
      <div className="section-heading-row">
        <h2 className="section-title">{sectionTitle}</h2>
        <p className="section-subtitle">{sectionSubtitle}</p>
      </div>
      {error ? (
        <div className="library-feedback" role="alert">
          <p className="error-text">{error}</p>
          <button type="button" className="library-clear-button" onClick={onRetry}>Retry</button>
        </div>
      ) : null}
      {loading ? (
        <p className="muted library-feedback">
          Loading remote media results...
        </p>
      ) : null}
      {ready && items.length > 0 ? (
        <div className={gridClass}>
          {items.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              layout="library"
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
      {ready && items.length === 0 ? (
        <PhoneExploreEmpty hasMore={hasMore} />
      ) : null}
      {ready && loadingMore ? (
        <p className="muted library-feedback" role="status" aria-live="polite">
          Loading more titles...
        </p>
      ) : null}
      {ready && items.length > 0 && !hasMore ? (
        <p className="muted library-feedback">
          Reached the end of this tag catalog.
        </p>
      ) : null}
      {ready && hasMore ? (
        <div ref={loadMoreSentinelRef} className="library-load-more-sentinel" aria-hidden="true" />
      ) : null}
    </section>
  );
}

export function MediaExplorePagePhone({
  token,
  user,
  onLogout,
}: MediaExplorePagePhoneProps) {
  const navigate = useNavigate();
  const {
    catalogMode,
    setCatalogMode,
    tagFilter,
    setTagFilter,
    typeFilter,
    setTypeFilter,
    remoteItems,
    setPage,
    hasMore,
    loading,
    loadingMore,
    error,
    retry,
    resetExploreForTag: resetBaseExploreForTag,
  } = useExploreCatalogState({
    token,
    remotePageSize: REMOTE_PAGE_SIZE,
    loadOnRestoredSession: true,
    skipInitialFetchWhenRestored: false,
    trackScrollTop: false,
    errorMessage: "Failed to search remote media catalogs.",
  });
  const [query, setQuery] = useState("");
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useExploreWindowLoadMoreSentinel({
    hasMore,
    loading,
    loadingMore,
    remoteItemsLength: remoteItems.length,
    setPage,
    tagFilter,
    loadMoreSentinelRef,
  });

  const openDetails = useCallback(
    (mediaId: string) => {
      navigate(`/details/${mediaId}`);
    },
    [navigate],
  );

  const resetExploreForTag = useCallback(
    (nextTag: string) => {
      resetBaseExploreForTag(nextTag, { resetScrollTop: false });
    },
    [resetBaseExploreForTag],
  );

  const selectableTags = useMemo(() => {
    return [...EXPECTED_TAGS_BY_MODE[catalogMode]];
  }, [catalogMode]);

  const typeCounts = useMemo(() => {
    return getExploreTypeCounts(remoteItems);
  }, [remoteItems]);

  const filteredItems = useMemo(() => {
    return getFilteredExploreItems(remoteItems, typeFilter);
  }, [remoteItems, typeFilter]);

  const randomDetailsCandidates = useMemo(() => filteredItems, [filteredItems]);

  const useCompactResultsGrid = shouldUseCompactExploreGrid(filteredItems);

  const sectionTitle =
    catalogMode === "anime" ? "Anime Explorer" : "Movie & TV Explorer";

  const sectionSubtitle = tagFilter
    ? `Showing results from ${providerLabelForMode(catalogMode)} tagged "${tagFilter}".`
    : `Choose a tag to browse ${providerLabelForMode(catalogMode)} titles.`;

  function handleModeChange(nextMode: ExploreCatalogMode) {
    if (nextMode === catalogMode) {
      return;
    }

    const nextTag = QUICK_TAGS_BY_MODE[nextMode][0] ?? "";
    setCatalogMode(nextMode);
    setTypeFilter("all");
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }

  function handleTagSelect(nextTag: string) {
    setTagFilter(nextTag);
    setTypeFilter("all");
    resetExploreForTag(nextTag);
  }

  function handleClearTag() {
    setTagFilter("");
    setTypeFilter("all");
    resetExploreForTag("");
  }

  function resetExploreFilters() {
    const nextTag = QUICK_TAGS_BY_MODE[catalogMode][0] ?? "";
    setTypeFilter("all");
    setTagFilter(nextTag);
    resetExploreForTag(nextTag);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(randomDetailsCandidates);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [openDetails, randomDetailsCandidates]);

  return (
    <PhonePageShell pageKey="explore">
      <main className="browse-page media-library-page media-explore-page phone-explore-page">
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
          className="library-toolbar phone-explore-toolbar"
          aria-label="Explore controls"
        >
          <div className="library-filters">
            <div className="library-filter-group phone-explore-catalog-group">
              <p className="library-filter-label">Catalog</p>
              <div
                className="library-chip-row"
                role="group"
                aria-label="Select catalog type"
              >
                <button
                  type="button"
                  className={
                    catalogMode === "non-anime"
                      ? "library-chip is-active"
                      : "library-chip"
                  }
                  onClick={() => handleModeChange("non-anime")}
                >
                  Non-Anime
                </button>
                <button
                  type="button"
                  className={
                    catalogMode === "anime"
                      ? "library-chip is-active"
                      : "library-chip"
                  }
                  onClick={() => handleModeChange("anime")}
                >
                  Anime
                </button>
              </div>
            </div>

            <div className="library-filter-group phone-explore-type-group">
              <p className="library-filter-label">Type</p>
              <div
                className="library-chip-row"
                role="group"
                aria-label="Filter by media type"
              >
                <button
                  type="button"
                  className={
                    typeFilter === "all"
                      ? "library-chip is-active"
                      : "library-chip"
                  }
                  onClick={() => setTypeFilter("all")}
                >
                  All
                  <span className="library-chip-count">{typeCounts.all}</span>
                </button>
                <button
                  type="button"
                  className={
                    typeFilter === "movie"
                      ? "library-chip is-active"
                      : "library-chip"
                  }
                  onClick={() => setTypeFilter("movie")}
                >
                  Movies
                  <span className="library-chip-count">{typeCounts.movie}</span>
                </button>
                <button
                  type="button"
                  className={
                    typeFilter === "show"
                      ? "library-chip is-active"
                      : "library-chip"
                  }
                  onClick={() => setTypeFilter("show")}
                >
                  Shows
                  <span className="library-chip-count">{typeCounts.show}</span>
                </button>
              </div>
            </div>

            <label
              className="library-filter-group"
              htmlFor="explore-phone-tag-select"
            >
              <span className="library-filter-label">Tag</span>
              <select
                id="explore-phone-tag-select"
                className="library-select"
                value={tagFilter}
                onChange={(event) => handleTagSelect(event.target.value)}
              >
                <option value="">Select Tag</option>
                {selectableTags.map((tag) => (
                  <option key={tag.toLowerCase()} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            className="library-stat-block phone-explore-stat-block"
            aria-live="polite"
          >
            <div className="phone-explore-stat-summary">
              <span className="library-stat-value">
                {filteredItems.length.toLocaleString()}
              </span>
              <span className="library-stat-label">Titles shown</span>
            </div>
            <div className="phone-explore-stat-actions">
              {tagFilter ? (
                <button
                  type="button"
                  className="library-clear-button"
                  onClick={handleClearTag}
                >
                  Clear Tag
                </button>
              ) : null}
              <button
                type="button"
                className="library-clear-button"
                onClick={resetExploreFilters}
              >
                Reset Explore
              </button>
            </div>
          </div>
        </section>

        <PhoneExploreResults
          items={filteredItems}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          hasMore={hasMore}
          compact={useCompactResultsGrid}
          sectionTitle={sectionTitle}
          sectionSubtitle={sectionSubtitle}
          onOpen={openDetails}
          onRetry={retry}
          loadMoreSentinelRef={loadMoreSentinelRef}
        />
      </main>
    </PhonePageShell>
  );
}
