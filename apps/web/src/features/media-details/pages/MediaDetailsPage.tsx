import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BroadcastNavBadge } from "../../broadcast/components/BroadcastNavBadge";
import { AssignToShowDialog } from "../../media-management/components/AssignToShowDialog";
import { EditMetadataDialog } from "../../media-management/components/EditMetadataDialog";
import { LibrarySearchForm } from "../../navigation/components/LibrarySearchForm";
import { ProfileMenu } from "../../navigation/components/ProfileMenu";
import { listMedia } from "../../shared/services/api";
import type { MediaItem, User } from "../../shared/services/types";
import { isAdminRole } from "../../auth/services/roles";
import { EpisodesSection } from "../components/sections/EpisodesSection";
import { RemoteSeriesEpisodesSection } from "../components/sections/RemoteSeriesEpisodesSection";
import { ScenePreviewsSection } from "../components/sections/ScenePreviewsSection";
import { SeriesCollectionSection } from "../components/sections/SeriesCollectionSection";
import { SeriesCompletenessSection } from "../components/sections/SeriesCompletenessSection";
import { TechnicalDetailsSection } from "../components/sections/TechnicalDetailsSection";
import { backdropImageUrl } from "../services/mediaDetailsUtils";
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from "../../library/services/librarySearchUtils";
import { useMediaDetailsData } from "../services/useMediaDetailsData";
import { useMediaDetailsDerivations } from "../services/useMediaDetailsDerivations";
import { MediaDetailsHero } from "../components/MediaDetailsHero";
import { useMissingMediaRedirect } from "../services/useMissingMediaRedirect";
import { useSeriesEpisodeTracker } from "../services/useSeriesEpisodeTracker";
import { useRemoteSeriesEpisodeCatalog } from "../services/useRemoteSeriesEpisodeCatalog";
import {
  remoteSeriesDetailsPath,
  resolveRemoteActiveSeason,
  selectedSeasonForMedia,
  type MediaSeasonSelection,
} from "../services/remoteSeriesEpisodes";
import { useSafeBackNavigation } from "../../navigation/services/safeBackNavigation";
import {
  AddonMediaItemActions,
  AddonMediaItemSurfaces,
} from "../../addons/runtime/AddonHostSlots";
import { MediaModeSwitchSlot } from "../../media-mode/components/MediaModeSwitcher";
import { MediaHomeButton } from "../../navigation/components/MediaHomeButton";

interface MediaDetailsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

type DetailsDerivations = ReturnType<typeof useMediaDetailsDerivations>;

function MediaDetailsTopBar(props: {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onOpenRandomDetails: () => void | Promise<void>;
  user: User;
  onLogout: () => void;
}) {
  return (
    <header className="top-nav" data-tv-focus-zone="top-nav">
      <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
        <button
          type="button"
          className="nav-back-button"
          aria-label="Go back"
          title="Go back"
          onClick={props.onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p className="brand-mark">YEEN</p>
        <p className="page-nav-title" title={props.title}>{props.title}</p>
      </div>

      <MediaModeSwitchSlot placement="top-nav" />

      <div data-tv-focus-lane-id="top-nav-broadcast">
        <BroadcastNavBadge />
      </div>

      <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
        <MediaHomeButton />
        <LibrarySearchForm
          query={props.query}
          onQueryChange={props.onQueryChange}
          onSearchSubmit={props.onSearchSubmit}
          placeholder="Search titles and paths"
          onOpenRandomDetails={props.onOpenRandomDetails}
        />
        <ProfileMenu user={props.user} onLogout={props.onLogout} />
      </div>
    </header>
  );
}

function DetailsBodySections(props: {
  derivations: DetailsDerivations;
  current: MediaItem;
  isRemoteItem: boolean;
  isAdmin: boolean;
  onNavigate: (to: string) => void;
  onEditItem: (item: MediaItem) => void;
  onSelectSeason: (season: number) => void;
}) {
  const d = props.derivations;
  return (
    <>
      {d.detailType === "show" && !props.isRemoteItem ? (
        <EpisodesSection
          seasonGroups={d.seasonGroups}
          activeSeason={d.activeSeason}
          activeSeasonEpisodes={d.activeSeasonEpisodes}
          progressById={d.progressById}
          nextUpEpisodeId={d.nextUpEpisode?.id ?? null}
          onSelectSeason={props.onSelectSeason}
          onNavigate={props.onNavigate}
          isAdmin={props.isAdmin}
          onEditEpisode={props.onEditItem}
        />
      ) : null}
      {d.detailType === "series" ? (
        <SeriesCollectionSection
          current={props.current}
          relatedMovies={d.relatedMovies}
          progressById={d.progressById}
          onNavigate={props.onNavigate}
          isAdmin={props.isAdmin}
          onEditMovie={props.onEditItem}
        />
      ) : null}
      {d.detailType === "movie" ? (
        <ScenePreviewsSection
          current={props.current}
          onNavigate={props.onNavigate}
        />
      ) : null}
      {!props.isRemoteItem && d.detailType !== "show" ? (
        <TechnicalDetailsSection current={props.current} />
      ) : null}
    </>
  );
}

function DetailsDialogs(props: {
  token: string;
  current: MediaItem;
  showEpisodes: MediaItem[];
  canEdit: boolean;
  showSeriesDialog: boolean;
  showEditDialog: boolean;
  editingItem: MediaItem | null;
  closeSeries: () => void;
  closeEdit: () => void;
  closeEditingItem: () => void;
  reload: () => void;
}) {
  const assigned = () => {
    props.closeSeries();
    props.reload();
  };
  const savedCurrent = () => {
    props.closeEdit();
    props.reload();
  };
  const savedItem = () => {
    props.closeEditingItem();
    props.reload();
  };
  return (
    <>
      {props.showSeriesDialog && props.canEdit ? (
        <AssignToShowDialog
          token={props.token}
          selectedItems={props.showEpisodes}
          onClose={props.closeSeries}
          onAssigned={assigned}
        />
      ) : null}
      {props.showEditDialog && props.canEdit ? (
        <EditMetadataDialog
          token={props.token}
          media={props.current}
          onClose={props.closeEdit}
          onSaved={savedCurrent}
        />
      ) : null}
      {props.editingItem && props.canEdit ? (
        <EditMetadataDialog
          token={props.token}
          media={props.editingItem}
          onClose={props.closeEditingItem}
          onSaved={savedItem}
        />
      ) : null}
    </>
  );
}

function RemoteLibraryMatchNotice(props: {
  match: MediaItem | null;
  onOpen: (mediaId: string) => void;
}) {
  if (!props.match) return null;

  return (
    <aside className="remote-library-match-notice" role="status" aria-live="polite">
      <span className="remote-library-match-icon" aria-hidden="true">✓</span>
      <span>
        <strong>Already in your library</strong>
        <small>{props.match.title}</small>
      </span>
      <button
        type="button"
        onClick={() => props.onOpen(props.match?.id ?? '')}
      >
        Open library copy
      </button>
    </aside>
  );
}

export function MediaDetailsPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: MediaDetailsPageProps) {
  const { mediaId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigateBackSafely = useSafeBackNavigation("/library");
  const [query, setQuery] = useState("");

  const fallbackClassName = hideTopNav
    ? "media-details-page phone-details-page"
    : "media-details-page";

  const handleBackNavigation = () => {
    navigateBackSafely();
  };

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const [seasonSelection, setSeasonSelection] =
    useState<MediaSeasonSelection | null>(null);
  const selectedSeason = selectedSeasonForMedia(seasonSelection, mediaId);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<MediaItem | null>(null);
  const { items, progress, loading, error, libraryMatch, reload } = useMediaDetailsData(
    mediaId,
    token,
  );

  const {
    current,
    progressById,
    detailType,
    showEpisodes,
    relatedMovies,
    seasonGroups,
    activeSeason,
    activeSeasonEpisodes,
    showStats,
    nextUpEpisode,
  } = useMediaDetailsDerivations(items, progress, mediaId, selectedSeason);

  const {
    tracker: seriesTracker,
    loading: seriesTrackerLoading,
    error: seriesTrackerError,
  } = useSeriesEpisodeTracker({
    token,
    current,
  });
  const {
    catalog: remoteSeriesCatalog,
    loading: remoteSeriesCatalogLoading,
    error: remoteSeriesCatalogError,
  } = useRemoteSeriesEpisodeCatalog({ token, current });

  const requestedSeason = Number.parseInt(searchParams.get("season") ?? "", 10);
  const requestedEpisode = Number.parseInt(searchParams.get("episode") ?? "", 10);
  const focusedSeason = Number.isInteger(requestedSeason) && requestedSeason > 0
    ? requestedSeason
    : null;
  const focusedEpisode = Number.isInteger(requestedEpisode) && requestedEpisode > 0
    ? requestedEpisode
    : null;
  const remoteActiveSeason = resolveRemoteActiveSeason(
    focusedSeason,
    selectedSeason,
  );

  useMissingMediaRedirect({
    current,
    loading,
    error,
    mediaId,
    items,
    navigate,
  });

  const randomDetailsCandidates = useMemo(
    () => toRandomDetailsCandidates(items),
    [items],
  );

  const openRandomDetails = useCallback(async () => {
    const localCandidate = pickRandomItem(randomDetailsCandidates);
    if (localCandidate) {
      navigate(`/details/${localCandidate.id}`);
      return;
    }

    try {
      const mediaItems = await listMedia(token);
      const fallbackCandidate = pickRandomItem(
        toRandomDetailsCandidates(mediaItems),
      );
      if (!fallbackCandidate) {
        return;
      }

      navigate(`/details/${fallbackCandidate.id}`);
    } catch {
      // Keep details view interactive if random lookup fails.
    }
  }, [navigate, randomDetailsCandidates, token]);

  const desktopTopNav = hideTopNav ? null : (
    <MediaDetailsTopBar
      title={current?.title ?? "Media details"}
      query={query}
      onQueryChange={setQuery}
      onSearchSubmit={handleSearch}
      onBack={handleBackNavigation}
      onOpenRandomDetails={openRandomDetails}
      user={user}
      onLogout={onLogout}
    />
  );

  const renderFallback = (content: ReactNode) => (
    <main className={fallbackClassName}>
      {headerContent}
      {desktopTopNav}
      {content}
    </main>
  );

  if (loading) {
    return renderFallback(<p className="muted">Loading details...</p>);
  }

  if (error) {
    return renderFallback(
      <>
        <p className="error-text">{error}</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => navigate("/")}
        >
          Back To Library
        </button>
      </>,
    );
  }

  if (!current) {
    return renderFallback(
      <>
        <p className="error-text">Media item not found.</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => navigate("/")}
        >
          Back To Library
        </button>
      </>,
    );
  }

  const heroBackdropImageUrl = backdropImageUrl(current);
  const isRemoteItem = Boolean(current.isRemote);
  const isAdmin = isAdminRole(user.role);
  const canEditMetadata = isAdmin && !isRemoteItem;
  const detailsPageClassName = hideTopNav
    ? "media-details-page details-page-v2 phone-details-page"
    : "media-details-page details-page-v2";
  return (
    <main
      className={detailsPageClassName}
      style={
        heroBackdropImageUrl
          ? {
              ["--details-backdrop" as string]: `url("${heroBackdropImageUrl}")`,
            }
          : undefined
      }
    >
      <div className="details-backdrop" aria-hidden="true" />

      {headerContent}

      {desktopTopNav}

      <MediaDetailsHero
        current={current}
        detailType={detailType}
        nextUpEpisode={nextUpEpisode}
        progressById={progressById}
        showStats={showStats}
        relatedMoviesCount={relatedMovies.length}
        heroBackdropImageUrl={heroBackdropImageUrl}
        isAdmin={isAdmin}
        onPlay={(href) => navigate(href)}
        onPlayFromStart={(playTargetId) => navigate(`/player/${playTargetId}`)}
        onEditSeries={() => setShowSeriesDialog(true)}
        onEditMetadata={() => setShowEditDialog(true)}
        seriesCompletenessContent={
          detailType === "show" ? (
            <SeriesCompletenessSection
              tracker={seriesTracker}
              loading={seriesTrackerLoading}
              error={seriesTrackerError}
              onOpenMissing={(source, providerId, season, episode) =>
                navigate(
                  remoteSeriesDetailsPath(
                    source,
                    providerId,
                    season,
                    episode,
                  ),
                )
              }
            />
          ) : null
        }
        addonActionsContent={<AddonMediaItemActions mediaItem={current} />}
      />

      <AddonMediaItemActions mediaItem={current} placement="after-hero" />
      <AddonMediaItemSurfaces mediaItem={current} />

      {isRemoteItem && detailType === "show" ? (
        <RemoteSeriesEpisodesSection
          current={current}
          catalog={remoteSeriesCatalog}
          loading={remoteSeriesCatalogLoading}
          error={remoteSeriesCatalogError}
          activeSeason={remoteActiveSeason}
          focusedEpisode={focusedEpisode}
          onSelectSeason={(season) => {
            setSeasonSelection({ mediaId, seasonNumber: season });
            navigate(
              remoteSeriesDetailsPath(
                current.remoteSource === "jikan" ? "jikan" : "tmdb",
                current.remoteSourceId ?? "",
                season,
              ),
              { replace: true },
            );
          }}
          onSelectEpisode={(season, episode) => {
            setSeasonSelection({ mediaId, seasonNumber: season });
            navigate(
              remoteSeriesDetailsPath(
                current.remoteSource === "jikan" ? "jikan" : "tmdb",
                current.remoteSourceId ?? "",
                season,
                episode,
              ),
              { replace: true },
            );
          }}
        />
      ) : null}

      <DetailsBodySections
        derivations={{
          current,
          progressById,
          detailType,
          showEpisodes,
          relatedMovies,
          seasonGroups,
          activeSeason,
          activeSeasonEpisodes,
          showStats,
          nextUpEpisode,
        }}
        current={current}
        isRemoteItem={isRemoteItem}
        isAdmin={isAdmin}
        onNavigate={navigate}
        onEditItem={setEditingEpisode}
        onSelectSeason={(seasonNumber) =>
          setSeasonSelection({ mediaId, seasonNumber })
        }
      />
      <DetailsDialogs
        token={token}
        current={current}
        showEpisodes={showEpisodes}
        canEdit={canEditMetadata}
        showSeriesDialog={showSeriesDialog}
        showEditDialog={showEditDialog}
        editingItem={editingEpisode}
        closeSeries={() => setShowSeriesDialog(false)}
        closeEdit={() => setShowEditDialog(false)}
        closeEditingItem={() => setEditingEpisode(null)}
        reload={reload}
      />
      <RemoteLibraryMatchNotice
        match={libraryMatch}
        onOpen={(libraryMediaId) => navigate(`/details/${libraryMediaId}`)}
      />
    </main>
  );
}
