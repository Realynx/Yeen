import { mediaChapterThumbnailUrl } from '../../lib/api';
import type { MediaItem, ProgressEntry } from '../../lib/types';
import {
  episodeDisplayTitle,
  episodeFrameImageUrl,
  formatBytes,
  formatDuration,
  formatTimestamp,
  isResumableProgress,
  playerHref,
  previewImageUrl,
  progressPercent,
} from './mediaDetailsUtils';

interface EpisodesSectionProps {
  seasonGroups: Array<[number, MediaItem[]]>;
  activeSeason: number | null;
  activeSeasonEpisodes: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  onSelectSeason: (season: number) => void;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditEpisode?: (episode: MediaItem) => void;
}

export function EpisodesSection({
  seasonGroups,
  activeSeason,
  activeSeasonEpisodes,
  progressById,
  onSelectSeason,
  onNavigate,
  isAdmin,
  onEditEpisode,
}: EpisodesSectionProps) {
  return (
    <section>
      <div className="section-heading-row">
        <h3 className="section-title">Episodes</h3>
        {seasonGroups.length > 1 ? (
          <div className="season-tabs" role="tablist">
            {seasonGroups.map(([seasonNumber, episodes]) => {
              const isActive = activeSeason === seasonNumber;
              return (
                <button
                  key={`season-tab-${seasonNumber}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`season-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelectSeason(seasonNumber)}
                >
                  {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
                  <span className="season-tab-count">{episodes.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {activeSeasonEpisodes.length === 0 ? (
        <p className="muted">No episodes were indexed for this show.</p>
      ) : (
        <div className="episode-card-list">
          {activeSeasonEpisodes.map((episode) => {
            const episodeImage = episodeFrameImageUrl(episode);
            const episodeProgress = progressById.get(episode.id);
            const episodePercent = progressPercent(episodeProgress);
            const watched = Boolean(episodeProgress?.completed);
            const inProgress = isResumableProgress(episodeProgress);

            return (
              <div
                key={episode.id}
                className={`episode-card${watched ? ' is-watched' : ''}${inProgress ? ' is-in-progress' : ''}`}
                onClick={() => onNavigate(playerHref(episode.id, episodeProgress))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(playerHref(episode.id, episodeProgress)); }}
              >
                <div className="episode-card-thumb" aria-hidden="true">
                  {episodeImage ? (
                    <img src={episodeImage} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="episode-thumb-fallback">
                      {String(episode.episodeNumber ?? '?').padStart(2, '0')}
                    </span>
                  )}
                  <span className="episode-play-overlay" aria-hidden="true">▶</span>
                  {watched ? <span className="episode-watched-badge">✓ Watched</span> : null}
                  {inProgress ? (
                    <div className="episode-progress" aria-hidden="true">
                      <div style={{ width: `${episodePercent}%` }} />
                    </div>
                  ) : null}
                </div>

                <div className="episode-info">
                  <div className="episode-info-header">
                    <p className="episode-code">
                      S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E{String(episode.episodeNumber ?? 0).padStart(2, '0')}
                      <span className="episode-runtime"> · {formatDuration(episode.durationSeconds)}</span>
                    </p>
                    {isAdmin && onEditEpisode ? (
                      <button
                        type="button"
                        className="episode-edit-btn"
                        aria-label={`Edit metadata for ${episodeDisplayTitle(episode)}`}
                        onClick={(e) => { e.stopPropagation(); onEditEpisode(episode); }}
                      >
                        ✎
                      </button>
                    ) : null}
                  </div>
                  <h4 className="episode-title">{episodeDisplayTitle(episode)}</h4>
                  {episode.description?.trim() ? (
                    <p className="episode-description">{episode.description}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface SeriesCollectionSectionProps {
  current: MediaItem;
  relatedMovies: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditMovie?: (movie: MediaItem) => void;
}

export function SeriesCollectionSection({
  current,
  relatedMovies,
  progressById,
  onNavigate,
  isAdmin,
  onEditMovie,
}: SeriesCollectionSectionProps) {
  return (
    <section>
      <h3 className="section-title">In This Collection</h3>
      <p className="section-subtitle">
        Related movies grouped by title and franchise.
      </p>
      <div className="series-grid">
        {relatedMovies.map((movie) => {
          const movieImage = previewImageUrl(movie);
          const movieProgress = progressById.get(movie.id);
          const moviePercent = progressPercent(movieProgress);
          const isCurrent = movie.id === current.id;

          return (
            <div
              key={movie.id}
              className={`series-card${isCurrent ? ' is-current' : ''}`}
              onClick={() => onNavigate(`/details/${movie.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(`/details/${movie.id}`); }}
            >
              <div className="series-card-thumb" aria-hidden="true">
                {movieImage ? (
                  <img src={movieImage} alt={movie.title} loading="lazy" decoding="async" />
                ) : (
                  <span>{movie.title.slice(0, 1).toUpperCase()}</span>
                )}
                {isResumableProgress(movieProgress) ? (
                  <div className="episode-progress" aria-hidden="true">
                    <div style={{ width: `${moviePercent}%` }} />
                  </div>
                ) : null}
                {movieProgress?.completed ? (
                  <span className="episode-watched-badge">✓</span>
                ) : null}
              </div>
              <h4>{movie.title}</h4>
              <p>{movie.releaseYear ?? 'Unknown year'} · {formatDuration(movie.durationSeconds)}</p>
              {isAdmin && onEditMovie ? (
                <button
                  type="button"
                  className="series-card-edit-btn"
                  aria-label={`Edit metadata for ${movie.title}`}
                  onClick={(e) => { e.stopPropagation(); onEditMovie(movie); }}
                >
                  ✎ Edit
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface ScenePreviewsSectionProps {
  current: MediaItem;
  onNavigate: (to: string) => void;
}

export function ScenePreviewsSection({ current, onNavigate }: ScenePreviewsSectionProps) {
  if (current.chapterThumbnails.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="section-title">Scene Previews</h3>
      <p className="section-subtitle">
        Jump straight into a moment — preview frames captured during scanning.
      </p>
      <div className="chapter-grid">
        {current.chapterThumbnails.map((thumbnail, index) => (
          <button
            key={`${current.id}-chapter-${index}`}
            type="button"
            className="chapter-thumb"
            onClick={() => {
              const targetSecond = Math.max(0, Math.floor(thumbnail.second));
              onNavigate(`/player/${current.id}?t=${targetSecond}`);
            }}
            title={`Jump near ${formatTimestamp(thumbnail.second)}`}
          >
            <img
              src={mediaChapterThumbnailUrl(current.id, index)}
              alt={`${current.title} chapter ${index + 1}`}
              loading="lazy"
              decoding="async"
            />
            <span>{formatTimestamp(thumbnail.second)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface TechnicalDetailsSectionProps {
  current: MediaItem;
}

export function TechnicalDetailsSection({ current }: TechnicalDetailsSectionProps) {
  const subtitleDetails = current.subtitleDetails ?? [];
  const mediaDetails = current.mediaDetails;

  return (
    <section>
      <h3 className="section-title">Technical Details</h3>
      <div className="movie-details-grid tech-grid">
        <article>
          <h4>Container</h4>
          <p>{current.container ?? current.extension.replace('.', '').toUpperCase()}</p>
        </article>
        <article>
          <h4>Video</h4>
          <p>
            {current.videoCodec ? current.videoCodec.toUpperCase() : 'Unknown'}
            {current.width && current.height ? ` · ${current.width}×${current.height}` : ''}
            {mediaDetails?.frameRate ? ` · ${mediaDetails.frameRate.toFixed(2)}fps` : ''}
          </p>
        </article>
        <article>
          <h4>Audio</h4>
          <p>
            {current.audioCodec ? current.audioCodec.toUpperCase() : 'Unknown'}
            {mediaDetails?.audioChannels ? ` · ${mediaDetails.audioChannels}ch` : ''}
          </p>
        </article>
        <article>
          <h4>Bitrate</h4>
          <p>
            {mediaDetails?.bitRate
              ? `${(mediaDetails.bitRate / 1_000_000).toFixed(2)} Mbps`
              : 'Unknown'}
          </p>
        </article>
        <article>
          <h4>File Size</h4>
          <p>{formatBytes(current.sizeBytes)}</p>
        </article>
        <article>
          <h4>Path</h4>
          <p className="mono-text">{current.relativePath}</p>
        </article>
      </div>

      {subtitleDetails.length > 0 ? (
        <>
          <h3 className="section-title">Subtitles</h3>
          <div className="subtitle-pill-list">
            {subtitleDetails.map((track, index) => (
              <span key={`${track.source}-${index}`} className="subtitle-pill">
                <strong>{track.label || track.language || 'Track'}</strong>
                <span className="subtitle-pill-kind">{track.kind}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
