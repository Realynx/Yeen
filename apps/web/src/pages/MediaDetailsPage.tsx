import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AssignToShowDialog } from '../components/AssignToShowDialog';
import { EditMetadataDialog } from '../components/EditMetadataDialog';
import { LibrarySearchForm } from '../components/LibrarySearchForm';
import { ProfileMenu } from '../components/ProfileMenu';
import { listMedia } from '../lib/api';
import type {
  MediaItem,
  User,
} from '../lib/types';
import { canAccessTorrentTools, isAdminRole } from '../lib/roles';
import {
  DownloadProgressSection,
  EpisodesSection,
  ScenePreviewsSection,
  SeriesCollectionSection,
  TechnicalDetailsSection,
} from './media-details/mediaDetailsSections';
import { backdropImageUrl } from './media-details/mediaDetailsUtils';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from './librarySearchUtils';
import { useMediaDetailsData } from './media-details/useMediaDetailsData';
import { useMediaDetailsDerivations } from './media-details/useMediaDetailsDerivations';
import { useIptorrentsFlow } from './media-details/useIptorrentsFlow';
import { useNyaaFlow } from './media-details/useNyaaFlow';
import { useMediaTorrentProgress } from './media-details/useMediaTorrentProgress';
import { MediaDetailsHero } from './media-details/MediaDetailsHero';
import { MediaTorrentSearchPopover } from './media-details/MediaTorrentSearchPopover';
import { useMediaDetailsTorrentSearch } from './media-details/useMediaDetailsTorrentSearch';

interface MediaDetailsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function MediaDetailsPage({ token, user, onLogout }: MediaDetailsPageProps) {
  const { mediaId = '' } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const hasTorrentAccess = canAccessTorrentTools(user.role);

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
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
    return (
      <main className="media-details-page">
        <p className="muted">Loading details...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="media-details-page">
        <p className="error-text">{error}</p>
        <button type="button" className="ghost-button" onClick={() => navigate('/')}>
          Back To Library
        </button>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="media-details-page">
        <p className="error-text">Media item not found.</p>
        <button type="button" className="ghost-button" onClick={() => navigate('/')}>
          Back To Library
        </button>
      </main>
    );
  }

  const heroBackdropImageUrl = backdropImageUrl(current);
  const isRemoteItem = Boolean(current.isRemote);
  const isAdmin = isAdminRole(user.role);
  const canEditMetadata = isAdmin && !isRemoteItem;

  return (
    <main
      className="media-details-page details-page-v2"
      style={heroBackdropImageUrl ? ({ ['--details-backdrop' as string]: `url("${heroBackdropImageUrl}")` }) : undefined}
    >
      <div className="details-backdrop" aria-hidden="true" />

      <header className="top-nav">
        <div className="top-nav-left">
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

        <div className="top-nav-right">
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

      <MediaTorrentSearchPopover
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

