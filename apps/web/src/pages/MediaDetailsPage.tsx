import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AssignToShowDialog } from '../components/AssignToShowDialog';
import { EditMetadataDialog } from '../components/EditMetadataDialog';
import { ProfileMenu } from '../components/ProfileMenu';
import type { MediaItem, ProgressEntry, User } from '../lib/types';
import {
  EpisodesSection,
  ScenePreviewsSection,
  SeriesCollectionSection,
  TechnicalDetailsSection,
} from './media-details/mediaDetailsSections';
import {
  areSeriesRelated,
  backdropImageUrl,
  episodeDisplayTitle,
  formatDuration,
  formatTimestamp,
  isResumableProgress,
  normalizeShowKey,
  playerHref,
  previewImageUrl,
  progressPercent,
  qualityLabel,
} from './media-details/mediaDetailsUtils';
import { useMediaDetailsData } from './media-details/useMediaDetailsData';

interface MediaDetailsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

type DetailType = 'show' | 'series' | 'movie';

export function MediaDetailsPage({ token, user, onLogout }: MediaDetailsPageProps) {
  const { mediaId = '' } = useParams();
  const navigate = useNavigate();

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<import('../lib/types').MediaItem | null>(null);
  const { items, progress, loading, error, reload } = useMediaDetailsData(mediaId, token);

  const progressById = useMemo(() => {
    const map = new Map<string, ProgressEntry>();
    for (const entry of progress) {
      map.set(entry.mediaId, entry);
    }
    return map;
  }, [progress]);

  const current = useMemo(() => {
    return items.find((item) => item.id === mediaId) ?? null;
  }, [items, mediaId]);

  const showEpisodes = useMemo(() => {
    if (!current || current.type !== 'show') {
      return [];
    }

    const key = normalizeShowKey(current);
    return items
      .filter((item) => item.type === 'show' && normalizeShowKey(item) === key)
      .sort((left, right) => {
        const seasonDelta = (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
        if (seasonDelta !== 0) {
          return seasonDelta;
        }

        const episodeDelta = (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
        if (episodeDelta !== 0) {
          return episodeDelta;
        }

        return episodeDisplayTitle(left).localeCompare(episodeDisplayTitle(right));
      });
  }, [current, items]);

  const relatedMovies = useMemo(() => {
    if (!current || (current.type !== 'movie' && current.type !== 'other')) {
      return [];
    }

    return items
      .filter((item) => item.type === 'movie')
      .filter((candidate) => areSeriesRelated(current, candidate))
      .sort((left, right) => {
        const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
        const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
        if (leftYear !== rightYear) {
          return leftYear - rightYear;
        }

        return left.title.localeCompare(right.title);
      });
  }, [current, items]);

  const detailType: DetailType = useMemo(() => {
    if (!current) {
      return 'movie';
    }

    if (current.type === 'show') {
      return 'show';
    }

    if (relatedMovies.length > 1) {
      return 'series';
    }

    return 'movie';
  }, [current, relatedMovies.length]);

  const seasonGroups = useMemo(() => {
    const groups = new Map<number, MediaItem[]>();

    for (const episode of showEpisodes) {
      const season = episode.seasonNumber ?? 0;
      const seasonEntries = groups.get(season) ?? [];
      seasonEntries.push(episode);
      groups.set(season, seasonEntries);
    }

    return [...groups.entries()].sort((left, right) => left[0] - right[0]);
  }, [showEpisodes]);

  const activeSeason = useMemo(() => {
    if (detailType !== 'show' || seasonGroups.length === 0) {
      return null;
    }

    if (selectedSeason !== null && seasonGroups.some(([season]) => season === selectedSeason)) {
      return selectedSeason;
    }

    return seasonGroups[0][0];
  }, [detailType, seasonGroups, selectedSeason]);

  const activeSeasonEpisodes = useMemo(() => {
    if (detailType !== 'show' || activeSeason === null) {
      return [];
    }

    return seasonGroups.find(([season]) => season === activeSeason)?.[1] ?? [];
  }, [detailType, seasonGroups, activeSeason]);

  // For a show landing page, prefer aggregated stats
  const showStats = useMemo(() => {
    if (detailType !== 'show') return null;
    const totalRuntime = showEpisodes.reduce((sum, ep) => sum + (ep.durationSeconds || 0), 0);
    const watched = showEpisodes.filter((ep) => progressById.get(ep.id)?.completed).length;
    return {
      seasonCount: seasonGroups.length,
      episodeCount: showEpisodes.length,
      totalRuntime,
      watched,
    };
  }, [detailType, showEpisodes, seasonGroups.length, progressById]);

  // Compute "next up" / resume target for shows
  const nextUpEpisode = useMemo(() => {
    if (detailType !== 'show' || showEpisodes.length === 0) return null;

    const inProgress = showEpisodes.find((ep) => {
      const entry = progressById.get(ep.id);
      return isResumableProgress(entry);
    });
    if (inProgress) return inProgress;

    const firstUnwatched = showEpisodes.find((ep) => !progressById.get(ep.id)?.completed);
    return firstUnwatched ?? showEpisodes[0];
  }, [detailType, showEpisodes, progressById]);

  // Current-item progress is reflected through heroResumeTarget when not a show
  // (heroResumeTarget falls back to `current`), so no separate variable is needed.

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
  const heroResumeTarget = detailType === 'show' ? nextUpEpisode : current;
  const iconImageUrl = previewImageUrl(current);
  const heroResumeProgress = heroResumeTarget ? progressById.get(heroResumeTarget.id) : null;
  const heroResumePercent = progressPercent(heroResumeProgress);
  const canResume = isResumableProgress(heroResumeProgress);
  const playTargetId = heroResumeTarget?.id ?? current.id;
  const playHref = playerHref(playTargetId, heroResumeProgress);

  const subtitleDetails = current.subtitleDetails ?? [];
  const typeKicker = detailType === 'show'
    ? `Series · ${showStats?.seasonCount ?? 0} ${showStats && showStats.seasonCount === 1 ? 'Season' : 'Seasons'} · ${showStats?.episodeCount ?? 0} Episodes`
    : detailType === 'series'
      ? `Movie Collection · ${relatedMovies.length} Titles`
      : 'Movie';

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
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <section
        className="details-hero details-hero-v2"
        style={heroBackdropImageUrl ? ({ ['--details-hero-backdrop' as string]: `url("${heroBackdropImageUrl}")` }) : undefined}
      >
        <div className="details-poster-shell" aria-hidden="true">
          {iconImageUrl ? (
            <img src={iconImageUrl} alt={current.title} className="details-poster" loading="eager" />
          ) : (
            <div className="details-poster-fallback">{current.title.slice(0, 1).toUpperCase()}</div>
          )}
        </div>

        <div className="details-copy">
          <p className="hero-kicker">{typeKicker}</p>
          <h2>{current.title}</h2>

          <div className="details-meta-strip">
            {current.releaseYear ? <span>{current.releaseYear}</span> : null}
            <span>{formatDuration(current.durationSeconds)}</span>
            <span>{qualityLabel(current)}</span>
            {current.videoCodec ? <span>{current.videoCodec.toUpperCase()}</span> : null}
            {current.audioCodec ? <span>{current.audioCodec.toUpperCase()}</span> : null}
            {subtitleDetails.length > 0 ? <span>CC {subtitleDetails.length}</span> : null}
            <span>{current.extension.replace('.', '').toUpperCase()}</span>
          </div>

          <p className="details-description">
            {current.description?.trim()
              ? current.description
              : 'No description available for this title yet.'}
          </p>

          <div className="hero-actions hero-actions-row">
            <button
              type="button"
              className="accent-button play-cta"
              onClick={() => navigate(playHref)}
            >
              <span className="play-cta-icon" aria-hidden="true">▶</span>
              {canResume
                ? (detailType === 'show' && heroResumeTarget
                  ? `Resume S${String(heroResumeTarget.seasonNumber ?? 0).padStart(2, '0')}E${String(heroResumeTarget.episodeNumber ?? 0).padStart(2, '0')}`
                  : 'Resume')
                : (detailType === 'show'
                  ? (showStats?.watched ? 'Continue Watching' : 'Start Watching')
                  : 'Play Now')}
            </button>
            {canResume ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => navigate(`/player/${playTargetId}`)}
              >
                Play From Start
              </button>
            ) : null}
            {user.role === 'admin' ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  detailType === 'show'
                    ? setShowSeriesDialog(true)
                    : setShowEditDialog(true)
                }
              >
                {detailType === 'show' ? 'Edit Series' : 'Edit Metadata'}
              </button>
            ) : null}
          </div>

          {canResume && heroResumeProgress ? (
            <div className="hero-resume-bar" aria-hidden="true">
              <div className="hero-resume-fill" style={{ width: `${heroResumePercent}%` }} />
              <span className="hero-resume-meta">
                {detailType === 'show' && heroResumeTarget
                  ? `Resume “${episodeDisplayTitle(heroResumeTarget)}” at ${formatTimestamp(heroResumeProgress.positionSeconds)}`
                  : `Resume at ${formatTimestamp(heroResumeProgress.positionSeconds)} of ${formatTimestamp(heroResumeProgress.durationSeconds)}`}
              </span>
            </div>
          ) : null}

          {detailType === 'show' && showStats ? (
            <div className="show-stats-strip">
              <span><strong>{showStats.episodeCount}</strong> Episodes</span>
              <span><strong>{showStats.watched}</strong> Watched</span>
              <span><strong>{formatDuration(showStats.totalRuntime)}</strong> Total Runtime</span>
            </div>
          ) : null}
        </div>
      </section>

      {detailType === 'show' ? (
        <EpisodesSection
          seasonGroups={seasonGroups}
          activeSeason={activeSeason}
          activeSeasonEpisodes={activeSeasonEpisodes}
          progressById={progressById}
          onSelectSeason={setSelectedSeason}
          onNavigate={(to) => navigate(to)}
          isAdmin={user.role === 'admin'}
          onEditEpisode={(episode) => setEditingEpisode(episode)}
        />
      ) : null}

      {detailType === 'series' ? (
        <SeriesCollectionSection
          current={current}
          relatedMovies={relatedMovies}
          progressById={progressById}
          onNavigate={(to) => navigate(to)}
          isAdmin={user.role === 'admin'}
          onEditMovie={(movie) => setEditingEpisode(movie)}
        />
      ) : null}

      {detailType === 'movie' ? (
        <ScenePreviewsSection current={current} onNavigate={(to) => navigate(to)} />
      ) : null}

      {detailType !== 'show' ? <TechnicalDetailsSection current={current} /> : null}

      {showSeriesDialog ? (
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

      {showEditDialog ? (
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

      {editingEpisode ? (
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

