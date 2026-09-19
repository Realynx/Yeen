import type { CSSProperties, ReactNode } from "react";
import type { MediaItem, ProgressEntry } from "../../shared/services/types";
import {
  episodeDisplayTitle,
  formatDuration,
  formatTimestamp,
  isResumableProgress,
  playerHref,
  previewImageUrl,
  qualityLabel,
} from "../services/mediaDetailsUtils";
import type {
  DetailType,
  ShowStats,
} from "../services/useMediaDetailsDerivations";

interface MediaDetailsHeroProps {
  current: MediaItem;
  detailType: DetailType;
  nextUpEpisode: MediaItem | null;
  progressById: Map<string, ProgressEntry>;
  showStats: ShowStats | null;
  relatedMoviesCount: number;
  heroBackdropImageUrl: string | null;
  isAdmin: boolean;
  onPlay: (href: string) => void;
  onPlayFromStart: (mediaId: string) => void;
  onEditSeries: () => void;
  onEditMetadata: () => void;
  seriesCompletenessContent?: ReactNode;
  addonActionsContent?: ReactNode;
}

function remoteSourceLabelFor(current: MediaItem): string {
  if (current.remoteSourceLabel) return current.remoteSourceLabel;
  return current.remoteSource
    ? current.remoteSource.toUpperCase()
    : "External Catalog";
}

function resumeContext(
  current: MediaItem,
  detailType: DetailType,
  nextEpisode: MediaItem | null,
  progressById: Map<string, ProgressEntry>,
) {
  const target = detailType === "show" ? nextEpisode : current;
  const progress = target ? (progressById.get(target.id) ?? null) : null;
  return { target, progress };
}

function typeKickerFor(
  detailType: DetailType,
  remote: boolean,
  remoteLabel: string,
  showStats: ShowStats | null,
  relatedMoviesCount: number,
): string {
  if (remote) return `Remote Result · ${remoteLabel}`;
  if (detailType === "show") {
    const count = showStats?.seasonCount ?? 0;
    return `Series · ${count} ${count === 1 ? "Season" : "Seasons"} · ${showStats?.episodeCount ?? 0} Episodes`;
  }
  if (detailType === "series")
    return `Movie Collection · ${relatedMoviesCount} Titles`;
  return "Movie";
}

function playLabelFor(
  detailType: DetailType,
  target: MediaItem | null,
  canResume: boolean,
  showStats: ShowStats | null,
): string {
  if (!canResume) {
    if (detailType !== "show") return "Play Now";
    return showStats?.watched ? "Continue Watching" : "Start Watching";
  }
  if (detailType !== "show" || !target) return "Resume";
  return `Resume S${String(target.seasonNumber ?? 0).padStart(2, "0")}E${String(target.episodeNumber ?? 0).padStart(2, "0")}`;
}

function HeroPoster({
  current,
  imageUrl,
}: {
  current: MediaItem;
  imageUrl: string | null;
}) {
  return (
    <div className="details-poster-shell" aria-hidden="true">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={current.title}
          className="details-poster"
          loading="eager"
        />
      ) : (
        <div className="details-poster-fallback">
          {current.title.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function HeroMetadata({ current }: { current: MediaItem }) {
  const subtitles = current.subtitleDetails ?? [];
  return (
    <div className="details-meta-strip">
      {current.releaseYear ? <span>{current.releaseYear}</span> : null}
      <span>{formatDuration(current.durationSeconds)}</span>
      <span>{qualityLabel(current)}</span>
      {current.videoCodec ? (
        <span>{current.videoCodec.toUpperCase()}</span>
      ) : null}
      {current.audioCodec ? (
        <span>{current.audioCodec.toUpperCase()}</span>
      ) : null}
      {subtitles.length > 0 ? <span>CC {subtitles.length}</span> : null}
      <span>{current.extension.replace(".", "").toUpperCase()}</span>
    </div>
  );
}

function HeroActions(props: {
  canPlay: boolean;
  canResume: boolean;
  canEdit: boolean;
  detailType: DetailType;
  playTargetId: string;
  playHref: string;
  playLabel: string;
  onPlay: (href: string) => void;
  onPlayFromStart: (id: string) => void;
  onEditSeries: () => void;
  onEditMetadata: () => void;
  addonContent?: ReactNode;
}) {
  if (!props.canPlay && !props.canEdit && !props.addonContent) return null;
  return (
    <div
      className="hero-actions hero-actions-row"
      data-tv-focus-lane-id="details-hero-actions"
    >
      {props.canPlay ? (
        <>
          <button
            type="button"
            className="accent-button play-cta"
            data-tv-initial-focus="true"
            data-tv-focus-key={`details-primary-play:${props.playTargetId}`}
            onClick={() => props.onPlay(props.playHref)}
          >
            <span className="play-cta-icon" aria-hidden="true">
              ▶
            </span>
            {props.playLabel}
          </button>
          {props.canResume ? (
            <button
              type="button"
              className="ghost-button"
              data-tv-focus-key={`details-play-from-start:${props.playTargetId}`}
              onClick={() => props.onPlayFromStart(props.playTargetId)}
            >
              Play From Start
            </button>
          ) : null}
        </>
      ) : null}
      {props.canEdit ? (
        <button
          type="button"
          className="ghost-button"
          onClick={
            props.detailType === "show"
              ? props.onEditSeries
              : props.onEditMetadata
          }
        >
          {props.detailType === "show" ? "Edit Series" : "Edit Metadata"}
        </button>
      ) : null}
      {props.addonContent}
    </div>
  );
}

function HeroResume(props: {
  canPlay: boolean;
  canResume: boolean;
  detailType: DetailType;
  progress: ProgressEntry | null;
  episodeTitle: string | null;
}) {
  if (!props.canPlay || !props.canResume || !props.progress) return null;
  if (props.detailType === "show" && props.episodeTitle) {
    return (
      <div className="hero-resume-meta">
        <span className="hero-resume-prefix">Resume</span>
        <span className="hero-resume-episode" title={props.episodeTitle}>
          “{props.episodeTitle}”
        </span>
        <span className="hero-resume-suffix">
          at {formatTimestamp(props.progress.positionSeconds)}
        </span>
      </div>
    );
  }
  return (
    <div className="hero-resume-meta">
      <span className="hero-resume-single">
        Resume at {formatTimestamp(props.progress.positionSeconds)} of{" "}
        {formatTimestamp(props.progress.durationSeconds)}
      </span>
    </div>
  );
}

function HeroShowStats({
  canPlay,
  detailType,
  stats,
}: {
  canPlay: boolean;
  detailType: DetailType;
  stats: ShowStats | null;
}) {
  if (!canPlay || detailType !== "show" || !stats) return null;
  return (
    <div className="show-stats-strip">
      <span>
        <strong>{stats.episodeCount}</strong> Episodes
      </span>
      <span>
        <strong>{stats.watched}</strong> Watched
      </span>
      <span>
        <strong>{formatDuration(stats.totalRuntime)}</strong> Total Runtime
      </span>
    </div>
  );
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
  onPlay,
  onPlayFromStart,
  onEditSeries,
  onEditMetadata,
  seriesCompletenessContent,
  addonActionsContent,
}: MediaDetailsHeroProps) {
  const isRemoteItem = Boolean(current.isRemote);
  const canPlay = !isRemoteItem;
  const canEditMetadata = isAdmin && !isRemoteItem;
  const remoteSourceLabel = remoteSourceLabelFor(current);
  const { target: heroResumeTarget, progress: heroResumeProgress } =
    resumeContext(current, detailType, nextUpEpisode, progressById);
  const canResume = isResumableProgress(heroResumeProgress);
  const playTargetId = heroResumeTarget?.id ?? current.id;
  const playHref = playerHref(playTargetId, heroResumeProgress);
  const heroResumeEpisodeTitle =
    detailType === "show" && heroResumeTarget
      ? episodeDisplayTitle(heroResumeTarget)
      : null;

  const iconImageUrl = previewImageUrl(current);

  const typeKicker = typeKickerFor(
    detailType,
    isRemoteItem,
    remoteSourceLabel,
    showStats,
    relatedMoviesCount,
  );
  const playLabel = playLabelFor(
    detailType,
    heroResumeTarget,
    canResume,
    showStats,
  );
  const heroClassName = `details-hero details-hero-v2${isRemoteItem ? " is-remote-details" : ""}`;

  const sectionStyle: CSSProperties | undefined = heroBackdropImageUrl
    ? ({
        ["--details-hero-backdrop" as string]: `url("${heroBackdropImageUrl}")`,
      } as CSSProperties)
    : undefined;

  return (
    <section
      className={heroClassName}
      style={sectionStyle}
      data-tv-focus-zone="hero"
    >
      <HeroPoster current={current} imageUrl={iconImageUrl} />

      <div className="details-copy">
        <p className="hero-kicker">{typeKicker}</p>
        <h2>{current.title}</h2>

        <HeroMetadata current={current} />

        <p className="details-description">
          {current.description?.trim()
            ? current.description
            : "No description available for this title yet."}
        </p>

        {isRemoteItem ? (
          <p className="details-remote-note">
            From {remoteSourceLabel}. Add it to your local library before
            playback.
          </p>
        ) : null}

        <HeroActions
          canPlay={canPlay}
          canResume={canResume}
          canEdit={canEditMetadata}
          detailType={detailType}
          playTargetId={playTargetId}
          playHref={playHref}
          playLabel={playLabel}
          onPlay={onPlay}
          onPlayFromStart={onPlayFromStart}
          onEditSeries={onEditSeries}
          onEditMetadata={onEditMetadata}
          addonContent={addonActionsContent}
        />
        <HeroResume
          canPlay={canPlay}
          canResume={canResume}
          detailType={detailType}
          progress={heroResumeProgress}
          episodeTitle={heroResumeEpisodeTitle}
        />
        <HeroShowStats
          canPlay={canPlay}
          detailType={detailType}
          stats={showStats}
        />

        {detailType === "show" ? seriesCompletenessContent : null}
      </div>
    </section>
  );
}
