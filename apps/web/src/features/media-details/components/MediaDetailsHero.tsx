import type { CSSProperties, ReactNode } from 'react';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import {
  episodeDisplayTitle,
  formatDuration,
  formatTimestamp,
  isResumableProgress,
  playerHref,
  previewImageUrl,
  progressPercent,
  qualityLabel,
} from '../services/mediaDetailsUtils';
import type {
  DetailType,
  ShowStats,
} from '../services/useMediaDetailsDerivations';

interface MediaDetailsHeroProps {
  current: MediaItem;
  detailType: DetailType;
  nextUpEpisode: MediaItem | null;
  progressById: Map<string, ProgressEntry>;
  showStats: ShowStats | null;
  relatedMoviesCount: number;
  heroBackdropImageUrl: string | null;
  isAdmin: boolean;
  canAccessTorrentTools: boolean;
  onPlay: (href: string) => void;
  onPlayFromStart: (mediaId: string) => void;
  preferredTorrentTrackerLabel: string;
  autoTorrentPendingMode: 'stream' | 'download' | null;
  autoTorrentBusy: boolean;
  autoTorrentStatus: string | null;
  autoTorrentError: string | null;
  onAutoTorrentPlay: () => void;
  onAutoTorrentDownload: () => void;
  onSearchTorrents: () => void;
  onEditSeries: () => void;
  onEditMetadata: () => void;
  seriesCompletenessContent?: ReactNode;
}

export function MediaDetailsHero({
  current,
  detailType,
  nextUpEpisode,
  progressById,
  showStats,
  relatedMoviesCount,
  heroBackdropImageUrl,
  isAdmin,
  canAccessTorrentTools,
  onPlay,
  onPlayFromStart,
  preferredTorrentTrackerLabel,
  autoTorrentPendingMode,
  autoTorrentBusy,
  autoTorrentStatus,
  autoTorrentError,
  onAutoTorrentPlay,
  onAutoTorrentDownload,
  onSearchTorrents,
  onEditSeries,
  onEditMetadata,
  seriesCompletenessContent,
}: MediaDetailsHeroProps) {
  const isRemoteItem = Boolean(current.isRemote);
  const canPlay = !isRemoteItem;
  const canEditMetadata = isAdmin && !isRemoteItem;
  const remoteSourceLabel = current.remoteSourceLabel
    ?? (current.remoteSource ? current.remoteSource.toUpperCase() : 'External Catalog');

  const heroResumeTarget = detailType === 'show' ? nextUpEpisode : current;
  const heroResumeProgress = heroResumeTarget ? progressById.get(heroResumeTarget.id) ?? null : null;
  const heroResumePercent = progressPercent(heroResumeProgress);
  const canResume = isResumableProgress(heroResumeProgress);
  const playTargetId = heroResumeTarget?.id ?? current.id;
  const playHref = playerHref(playTargetId, heroResumeProgress);
  const heroResumeEpisodeTitle =
    detailType === 'show' && heroResumeTarget
      ? episodeDisplayTitle(heroResumeTarget)
      : null;

  const iconImageUrl = previewImageUrl(current);

  const subtitleDetails = current.subtitleDetails ?? [];
  const typeKicker = isRemoteItem
    ? `Remote Result · ${remoteSourceLabel}`
    : detailType === 'show'
      ? `Series · ${showStats?.seasonCount ?? 0} ${showStats && showStats.seasonCount === 1 ? 'Season' : 'Seasons'} · ${showStats?.episodeCount ?? 0} Episodes`
      : detailType === 'series'
        ? `Movie Collection · ${relatedMoviesCount} Titles`
        : 'Movie';

  const playLabel = canResume
    ? (detailType === 'show' && heroResumeTarget
      ? `Resume S${String(heroResumeTarget.seasonNumber ?? 0).padStart(2, '0')}E${String(heroResumeTarget.episodeNumber ?? 0).padStart(2, '0')}`
      : 'Resume')
    : (detailType === 'show'
      ? (showStats?.watched ? 'Continue Watching' : 'Start Watching')
      : 'Play Now');
  const canShowAutoTorrentQuickActions = canAccessTorrentTools && isRemoteItem;
  const heroClassName = `details-hero details-hero-v2${isRemoteItem ? ' is-remote-details' : ''}`;
  const showActionRow = canPlay || canAccessTorrentTools || canEditMetadata;

  const sectionStyle: CSSProperties | undefined = heroBackdropImageUrl
    ? ({ ['--details-hero-backdrop' as string]: `url("${heroBackdropImageUrl}")` } as CSSProperties)
    : undefined;

  return (
    <section className={heroClassName} style={sectionStyle}>
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

        {isRemoteItem ? (
          <p className="details-remote-note">
            From {remoteSourceLabel}. Stream or download it first to add it to your local library.
          </p>
        ) : null}

        {showActionRow ? (
          <div className="hero-actions hero-actions-row">
            {canPlay ? (
              <>
                <button
                  type="button"
                  className="accent-button play-cta"
                  onClick={() => onPlay(playHref)}
                >
                  <span className="play-cta-icon" aria-hidden="true">▶</span>
                  {playLabel}
                </button>
                {canResume ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onPlayFromStart(playTargetId)}
                  >
                    Play From Start
                  </button>
                ) : null}
              </>
            ) : null}
            {canAccessTorrentTools ? (
              <>
                {canShowAutoTorrentQuickActions ? (
                  <>
                    <button
                      type="button"
                      className="ghost-button hero-torrent-quick hero-torrent-quick-play"
                      disabled={autoTorrentBusy}
                      onClick={onAutoTorrentPlay}
                    >
                      <span className="hero-torrent-quick-icon" aria-hidden="true">▶</span>
                      {autoTorrentPendingMode === 'stream'
                        ? `Finding Best on ${preferredTorrentTrackerLabel}...`
                        : `Play Best Seeder (${preferredTorrentTrackerLabel})`}
                    </button>

                    <button
                      type="button"
                      className="ghost-button hero-torrent-quick hero-torrent-quick-download"
                      disabled={autoTorrentBusy}
                      onClick={onAutoTorrentDownload}
                    >
                      <span className="hero-torrent-quick-icon" aria-hidden="true">↓</span>
                      {autoTorrentPendingMode === 'download'
                        ? `Finding Best on ${preferredTorrentTrackerLabel}...`
                        : `Download Best Seeder (${preferredTorrentTrackerLabel})`}
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  className="ghost-button"
                  onClick={onSearchTorrents}
                >
                  Search Torrents
                </button>
              </>
            ) : null}
            {canEditMetadata ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  detailType === 'show' ? onEditSeries() : onEditMetadata()
                }
              >
                {detailType === 'show' ? 'Edit Series' : 'Edit Metadata'}
              </button>
            ) : null}
          </div>
        ) : null}

        {canAccessTorrentTools && autoTorrentStatus ? (
          <p className="muted hero-torrent-feedback">{autoTorrentStatus}</p>
        ) : null}

        {canAccessTorrentTools && autoTorrentError ? (
          <p className="error-text hero-torrent-feedback">{autoTorrentError}</p>
        ) : null}

        {canPlay && canResume && heroResumeProgress ? (
          <div className="hero-resume-bar" aria-hidden="true">
            <div className="hero-resume-fill" style={{ width: `${heroResumePercent}%` }} />
            <span className="hero-resume-meta">
              {detailType === 'show' && heroResumeEpisodeTitle ? (
                <>
                  <span className="hero-resume-prefix">Resume</span>
                  <span className="hero-resume-episode" title={heroResumeEpisodeTitle}>
                    “{heroResumeEpisodeTitle}”
                  </span>
                  <span className="hero-resume-suffix">
                    at {formatTimestamp(heroResumeProgress.positionSeconds)}
                  </span>
                </>
              ) : (
                <span className="hero-resume-single">
                  Resume at {formatTimestamp(heroResumeProgress.positionSeconds)} of {formatTimestamp(heroResumeProgress.durationSeconds)}
                </span>
              )}
            </span>
          </div>
        ) : null}

        {canPlay && detailType === 'show' && showStats ? (
          <div className="show-stats-strip">
            <span><strong>{showStats.episodeCount}</strong> Episodes</span>
            <span><strong>{showStats.watched}</strong> Watched</span>
            <span><strong>{formatDuration(showStats.totalRuntime)}</strong> Total Runtime</span>
          </div>
        ) : null}

        {detailType === 'show' ? seriesCompletenessContent : null}
      </div>
    </section>
  );
}
