import type { MediaItem, ProgressEntry } from '../../../shared/services/types';
import {
  episodeDisplayTitle,
  episodeFrameImageUrl,
  formatDuration,
  isResumableProgress,
  playerHref,
  progressPercent,
} from '../../services/mediaDetailsUtils';

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
    <section data-tv-focus-zone="shelf">
      <div className="section-heading-row">
        <h3 className="section-title">Episodes</h3>
        {seasonGroups.length > 1 ? (
          <div
            className="season-tabs"
            role="tablist"
            data-tv-focus-lane-id="episode-season-tabs"
          >
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
        <div
          className="episode-card-list"
          data-tv-focus-lane-id="episode-card-list"
        >
          {activeSeasonEpisodes.map((episode) => {
            const episodeImage = episodeFrameImageUrl(episode);
            const episodeProgress = progressById.get(episode.id);
            const episodePercent = progressPercent(episodeProgress);
            const watched = Boolean(episodeProgress?.completed);
            const inProgress = isResumableProgress(episodeProgress);
            const showProgressBar = watched || inProgress;
            const progressWidth = watched ? 100 : episodePercent;

            return (
              <div
                key={episode.id}
                className={`episode-card${watched ? ' is-watched' : ''}${inProgress ? ' is-in-progress' : ''}`}
                onClick={() => onNavigate(playerHref(episode.id, episodeProgress))}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    onNavigate(playerHref(episode.id, episodeProgress));
                  }
                }}
              >
                <div className="episode-card-thumb" aria-hidden="true">
                  {episodeImage ? (
                    <img src={episodeImage} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="episode-thumb-fallback">
                      {String(episode.episodeNumber ?? '?').padStart(2, '0')}
                    </span>
                  )}
                  <span className="episode-play-overlay" aria-hidden="true">
                    ▶
                  </span>
                  {watched ? (
                    <span className="episode-watched-badge">✓ Watched</span>
                  ) : null}
                  {showProgressBar ? (
                    <div className="episode-progress" aria-hidden="true">
                      <div style={{ width: `${progressWidth}%` }} />
                    </div>
                  ) : null}
                </div>

                <div className="episode-info">
                  <div className="episode-info-header">
                    <p className="episode-code">
                      S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E
                      {String(episode.episodeNumber ?? 0).padStart(2, '0')}
                      <span className="episode-runtime">
                        {' '}
                        · {formatDuration(episode.durationSeconds)}
                      </span>
                    </p>
                    {isAdmin && onEditEpisode ? (
                      <button
                        type="button"
                        className="episode-edit-btn"
                        aria-label={`Edit metadata for ${episodeDisplayTitle(episode)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditEpisode(episode);
                        }}
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
