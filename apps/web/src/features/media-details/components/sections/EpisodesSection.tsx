import type { MediaItem, ProgressEntry } from "../../../shared/services/types";
import {
  episodeDisplayTitle,
  episodeFrameImageUrl,
  formatDuration,
  isResumableProgress,
  playerHref,
  progressPercent,
} from "../../services/mediaDetailsUtils";

interface EpisodesSectionProps {
  seasonGroups: Array<[number, MediaItem[]]>;
  activeSeason: number | null;
  activeSeasonEpisodes: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  nextUpEpisodeId?: string | null;
  onSelectSeason: (season: number) => void;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditEpisode?: (episode: MediaItem) => void;
}

function SeasonTabs(
  props: Pick<
    EpisodesSectionProps,
    "seasonGroups" | "activeSeason" | "progressById" | "onSelectSeason"
  >,
) {
  if (props.seasonGroups.length <= 1) return null;
  return (
    <div
      className="season-tabs"
      role="tablist"
      data-tv-focus-lane-id="episode-season-tabs"
    >
      {props.seasonGroups.map(([seasonNumber, episodes]) => {
        const watchedCount = episodes.filter(
          (episode) => props.progressById.get(episode.id)?.completed,
        ).length;
        const isActive = props.activeSeason === seasonNumber;
        return (
          <button
            key={`season-tab-${seasonNumber}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`season-tab${isActive ? " is-active" : ""}`}
            onClick={() => props.onSelectSeason(seasonNumber)}
          >
            {seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`}
            <span className="season-tab-count">
              {watchedCount}/{episodes.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function episodeStatusLabel(
  watched: boolean,
  nextUp: boolean,
  inProgress: boolean,
): string | null {
  if (watched) return "Watched";
  if (nextUp) return "Next Up";
  return inProgress ? "Resume" : null;
}

function EpisodeThumbnail(props: {
  episode: MediaItem;
  imageUrl: string | null;
  watched: boolean;
  inProgress: boolean;
  statusLabel: string | null;
  progressPercent: number;
}) {
  return (
    <div className="episode-card-thumb" aria-hidden="true">
      {props.imageUrl ? (
        <img src={props.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="episode-thumb-fallback">
          {String(props.episode.episodeNumber ?? "?").padStart(2, "0")}
        </span>
      )}
      <span className="episode-play-overlay" aria-hidden="true">
        ▶
      </span>
      {props.watched ? (
        <span className="episode-watched-badge">✓ Watched</span>
      ) : null}
      {props.statusLabel && !props.watched ? (
        <span className="episode-status-badge">{props.statusLabel}</span>
      ) : null}
      {props.watched || props.inProgress ? (
        <div className="episode-progress" aria-hidden="true">
          <div
            style={{ width: `${props.watched ? 100 : props.progressPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function EpisodeCard(props: {
  episode: MediaItem;
  progress: ProgressEntry | undefined;
  nextUpEpisodeId: string | null;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditEpisode?: (episode: MediaItem) => void;
}) {
  const { episode, progress } = props;
  const episodeImage = episodeFrameImageUrl(episode);
  const episodePercent = progressPercent(progress);
  const watched = Boolean(progress?.completed);
  const inProgress = isResumableProgress(progress);
  const isNextUp = episode.id === props.nextUpEpisodeId;
  const statusLabel = episodeStatusLabel(watched, isNextUp, inProgress);
  const navigateToEpisode = () =>
    props.onNavigate(playerHref(episode.id, progress));
  return (
    <div
      className={`episode-card${watched ? " is-watched" : ""}${inProgress ? " is-in-progress" : ""}`}
      onClick={navigateToEpisode}
      data-tv-focus-key={`episode:${episode.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") navigateToEpisode();
      }}
    >
      <EpisodeThumbnail
        episode={episode}
        imageUrl={episodeImage}
        watched={watched}
        inProgress={inProgress}
        statusLabel={statusLabel}
        progressPercent={episodePercent}
      />
      <div className="episode-info">
        <div className="episode-info-header">
          <p className="episode-code">
            S{String(episode.seasonNumber ?? 0).padStart(2, "0")}E
            {String(episode.episodeNumber ?? 0).padStart(2, "0")}
            <span className="episode-runtime">
              {" "}
              · {formatDuration(episode.durationSeconds)}
            </span>
          </p>
          {props.isAdmin && props.onEditEpisode ? (
            <button
              type="button"
              className="episode-edit-btn"
              aria-label={`Edit metadata for ${episodeDisplayTitle(episode)}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onEditEpisode?.(episode);
              }}
            >
              ✎
            </button>
          ) : null}
        </div>
        <h4 className="episode-title">{episodeDisplayTitle(episode)}</h4>
        {statusLabel ? (
          <p className="episode-status-line">
            {statusLabel}
            {inProgress && !watched ? ` at ${Math.round(episodePercent)}%` : ""}
          </p>
        ) : null}
        {episode.description?.trim() ? (
          <p className="episode-description">{episode.description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function EpisodesSection({
  seasonGroups,
  activeSeason,
  activeSeasonEpisodes,
  progressById,
  nextUpEpisodeId = null,
  onSelectSeason,
  onNavigate,
  isAdmin,
  onEditEpisode,
}: EpisodesSectionProps) {
  return (
    <section data-tv-focus-zone="shelf">
      <div className="section-heading-row">
        <h3 className="section-title">Episodes</h3>
        <SeasonTabs
          seasonGroups={seasonGroups}
          activeSeason={activeSeason}
          progressById={progressById}
          onSelectSeason={onSelectSeason}
        />
      </div>

      {activeSeasonEpisodes.length === 0 ? (
        <p className="muted">No episodes were indexed for this show.</p>
      ) : (
        <div
          className="episode-card-list"
          data-tv-focus-lane-id="episode-card-list"
        >
          {activeSeasonEpisodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              progress={progressById.get(episode.id)}
              nextUpEpisodeId={nextUpEpisodeId}
              onNavigate={onNavigate}
              isAdmin={isAdmin}
              onEditEpisode={onEditEpisode}
            />
          ))}
        </div>
      )}
    </section>
  );
}
