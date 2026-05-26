import { useCallback, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BroadcastNavBadge } from '../../broadcast/components/BroadcastNavBadge';
import { AssignToShowDialog } from '../../media-management/components/AssignToShowDialog';
import { EditMetadataDialog } from '../../media-management/components/EditMetadataDialog';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import {
  listMedia,
} from '../../shared/services/api';
import type {
  MediaItem,
  User,
} from '../../shared/services/types';
import { canAccessTorrentTools, isAdminRole } from '../../auth/services/roles';
import { DownloadProgressSection } from '../components/sections/DownloadProgressSection';
import { EpisodesSection } from '../components/sections/EpisodesSection';
import { ScenePreviewsSection } from '../components/sections/ScenePreviewsSection';
import { SeriesCollectionSection } from '../components/sections/SeriesCollectionSection';
import { SeriesCompletenessSection } from '../components/sections/SeriesCompletenessSection';
import { TechnicalDetailsSection } from '../components/sections/TechnicalDetailsSection';
import {
  backdropImageUrl,
} from '../services/mediaDetailsUtils';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { useMediaDetailsData } from '../services/useMediaDetailsData';
import { useMediaDetailsDerivations } from '../services/useMediaDetailsDerivations';
import { useIptorrentsFlow } from '../services/useIptorrentsFlow';
import { useNyaaFlow } from '../services/useNyaaFlow';
import { useMediaTorrentProgress } from '../services/useMediaTorrentProgress';
import { MediaDetailsHero } from '../components/MediaDetailsHero';
import { MediaTorrentSearchPopover } from '../components/MediaTorrentSearchPopover';
import { MediaTorrentSearchPopoverPhone } from '../components/MediaTorrentSearchPopoverPhone';
import { useMediaDetailsTorrentSearch } from '../services/useMediaDetailsTorrentSearch';
import { useMissingMediaRedirect } from '../services/useMissingMediaRedirect';
import { useSeriesEpisodeTracker } from '../services/useSeriesEpisodeTracker';
import { useSafeBackNavigation } from '../../navigation/services/safeBackNavigation';

interface MediaDetailsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
  usePhoneTorrentPopover?: boolean;
}

export function MediaDetailsPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
  usePhoneTorrentPopover = false,
}: MediaDetailsPageProps) {
  const { mediaId = '' } = useParams();
  const navigate = useNavigate();
  const navigateBackSafely = useSafeBackNavigation('/library');
  const [query, setQuery] = useState('');
  const hasTorrentAccess = canAccessTorrentTools(user.role);

  const fallbackClassName = hideTopNav
    ? 'media-details-page phone-details-page'
    : 'media-details-page';

  const renderFallback = (content: ReactNode) => (
    <main className={fallbackClassName}>
      {headerContent}
      {content}
    </main>
  );

  const handleBackNavigation = () => {
    navigateBackSafely();
  };

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<MediaItem | null>(null);
  const { items, progress, loading, error, reload } = useMediaDetailsData(mediaId, token);

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

  useMissingMediaRedirect({
    current,
    loading,
    error,
    mediaId,
    items,
    navigate,
  });

  const iptorrents = useIptorrentsFlow(token, mediaId, current, navigate);

  const nyaa = useNyaaFlow(token, mediaId, current, navigate);

  const torrentSearch = useMediaDetailsTorrentSearch({
    token,
    mediaId,
    current,
    hasTorrentAccess,
    iptorrents,
    nyaa,
  });

  const {
    torrent: activeDownloadTorrent,
    indexPendingReason: activeDownloadPendingReason,
  } = useMediaTorrentProgress(token, mediaId, current);

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
      const fallbackCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!fallbackCandidate) {
        return;
      }

      navigate(`/details/${fallbackCandidate.id}`);
    } catch {
      // Keep details view interactive if random lookup fails.
    }
  }, [navigate, randomDetailsCandidates, token]);

  if (loading) {
    return renderFallback(<p className="muted">Loading details...</p>);
  }

  if (error) {
    return renderFallback(
      <>
        <p className="error-text">{error}</p>
        <button type="button" className="ghost-button" onClick={() => navigate('/')}>
          Back To Library
        </button>
      </>,
    );
  }

  if (!current) {
    return renderFallback(
      <>
        <p className="error-text">Media item not found.</p>
        <button type="button" className="ghost-button" onClick={() => navigate('/')}>
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
    ? 'media-details-page details-page-v2 phone-details-page'
    : 'media-details-page details-page-v2';
  const TorrentSearchPopoverComponent = usePhoneTorrentPopover
    ? MediaTorrentSearchPopoverPhone
    : MediaTorrentSearchPopover;

  return (
    <main
      className={detailsPageClassName}
      style={heroBackdropImageUrl ? ({ ['--details-backdrop' as string]: `url("${heroBackdropImageUrl}")` }) : undefined}
    >
      <div className="details-backdrop" aria-hidden="true" />

      {headerContent}

      {!hideTopNav ? (
        <header className="top-nav" data-tv-focus-zone="top-nav">
          <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
            <button
              type="button"
              className="nav-back-button"
              aria-label="Go back"
              title="Go back"
              onClick={handleBackNavigation}
            >
              <span aria-hidden="true">←</span>
            </button>
            <p className="brand-mark">YEEN</p>
            <p className="page-nav-title" title={current.title}>{current.title}</p>
          </div>

          <div data-tv-focus-lane-id="top-nav-broadcast">
            <BroadcastNavBadge />
          </div>

          <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
            <LibrarySearchForm
              query={query}
              onQueryChange={setQuery}
              onSearchSubmit={handleSearch}
              placeholder="Search titles and paths"
              onOpenRandomDetails={openRandomDetails}
            />
            <ProfileMenu user={user} onLogout={onLogout} />
          </div>
        </header>
      ) : null}

      <MediaDetailsHero
        current={current}
        detailType={detailType}
        nextUpEpisode={nextUpEpisode}
        progressById={progressById}
        showStats={showStats}
        relatedMoviesCount={relatedMovies.length}
        heroBackdropImageUrl={heroBackdropImageUrl}
        isAdmin={isAdmin}
        canAccessTorrentTools={hasTorrentAccess}
        onPlay={(href) => navigate(href)}
        onPlayFromStart={(playTargetId) => navigate(`/player/${playTargetId}`)}
        preferredTorrentTrackerLabel={torrentSearch.preferredAutoTrackerLabel}
        autoTorrentPendingMode={torrentSearch.autoTorrentPendingMode}
        autoTorrentBusy={torrentSearch.heroAutoTorrentBusy}
        autoTorrentStatus={torrentSearch.heroAutoTorrentStatus}
        autoTorrentError={torrentSearch.heroAutoTorrentError}
        onAutoTorrentPlay={() => {
          void torrentSearch.startAutoBestSeededTorrent('stream');
        }}
        onAutoTorrentDownload={() => {
          void torrentSearch.startAutoBestSeededTorrent('download');
        }}
        onSearchTorrents={torrentSearch.openPopover}
        onEditSeries={() => setShowSeriesDialog(true)}
        onEditMetadata={() => setShowEditDialog(true)}
        seriesCompletenessContent={
          detailType === 'show' ? (
            <SeriesCompletenessSection
              tracker={seriesTracker}
              loading={seriesTrackerLoading}
              error={seriesTrackerError}
            />
          ) : null
        }
      />

      {activeDownloadTorrent ? (
        <DownloadProgressSection
          torrent={activeDownloadTorrent}
          indexPendingReason={activeDownloadPendingReason}
        />
      ) : null}

      {detailType === 'show' ? (
        <EpisodesSection
          seasonGroups={seasonGroups}
          activeSeason={activeSeason}
          activeSeasonEpisodes={activeSeasonEpisodes}
          progressById={progressById}
          nextUpEpisodeId={nextUpEpisode?.id ?? null}
          onSelectSeason={setSelectedSeason}
          onNavigate={(to) => navigate(to)}
          isAdmin={isAdmin}
          onEditEpisode={(episode) => setEditingEpisode(episode)}
        />
      ) : null}

      {detailType === 'series' ? (
        <SeriesCollectionSection
          current={current}
          relatedMovies={relatedMovies}
          progressById={progressById}
          onNavigate={(to) => navigate(to)}
          isAdmin={isAdmin}
          onEditMovie={(movie) => setEditingEpisode(movie)}
        />
      ) : null}

      {detailType === 'movie' ? (
        <ScenePreviewsSection current={current} onNavigate={(to) => navigate(to)} />
      ) : null}

      {!isRemoteItem && detailType !== 'show' ? (
        <TechnicalDetailsSection current={current} />
      ) : null}

      <TorrentSearchPopoverComponent
        open={torrentSearch.showPopover}
        title={current.title}
        trackerDescription={torrentSearch.trackerDescription}
        activeTracker={torrentSearch.activeTracker}
        hasTorrentAccess={hasTorrentAccess}
        iptorrentsSearchUrl={torrentSearch.iptorrentsSearchUrl}
        nyaaSearchUrl={torrentSearch.nyaaSearchUrl}
        nyaaSortBy={torrentSearch.nyaaSortBy}
        nyaaSortDirection={torrentSearch.nyaaSortDirection}
        resolvedNyaaPage={torrentSearch.resolvedNyaaPage}
        nyaaHasMore={torrentSearch.nyaaHasMore}
        iptorrents={iptorrents}
        nyaa={nyaa}
        onClose={torrentSearch.closePopover}
        onChangeTracker={torrentSearch.setActiveTracker}
        onSelectNyaaSort={torrentSearch.selectNyaaSort}
        onToggleNyaaSortDirection={torrentSearch.toggleNyaaSortDirection}
        onRefreshNyaaSearch={torrentSearch.refreshNyaaSearch}
        onPreviousNyaaPage={torrentSearch.goToPreviousNyaaPage}
        onNextNyaaPage={torrentSearch.goToNextNyaaPage}
        onRetryIptSearch={torrentSearch.retryIptSearch}
        onRetryNyaaSearch={torrentSearch.retryNyaaSearch}
      />

      {showSeriesDialog && canEditMetadata ? (
        <AssignToShowDialog
          token={token}
          selectedItems={showEpisodes}
          onClose={() => setShowSeriesDialog(false)}
          onAssigned={() => {
            setShowSeriesDialog(false);
            reload();
          }}
        />
      ) : null}

      {showEditDialog && canEditMetadata ? (
        <EditMetadataDialog
          token={token}
          media={current}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => {
            setShowEditDialog(false);
            reload();
          }}
        />
      ) : null}

      {editingEpisode && canEditMetadata ? (
        <EditMetadataDialog
          token={token}
          media={editingEpisode}
          onClose={() => setEditingEpisode(null)}
          onSaved={() => {
            setEditingEpisode(null);
            reload();
          }}
        />
      ) : null}
    </main>
  );
}
