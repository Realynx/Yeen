import { BroadcastViewerList } from "./BroadcastViewerList";
import type {
  BroadcastViewerStatus,
  MediaItem,
} from "../../shared/services/types";
import { PlayerMetadataBadges } from "./PlayerMetadataBadges";

interface PlayerDetailsProps {
  media: MediaItem | null;
  totalDuration: number;
  currentTime: number;
  showKeyboardShortcuts?: boolean;
  onOpenDetails?: () => void;
  broadcastEnabled?: boolean;
  broadcastViewers?: BroadcastViewerStatus[];
}

export function PlayerDetails({
  media,
  totalDuration,
  currentTime,
  showKeyboardShortcuts = true,
  onOpenDetails,
  broadcastEnabled = false,
  broadcastViewers = [],
}: PlayerDetailsProps) {
  if (!media) {
    return null;
  }

  const description = media.description?.trim();
  const displayTitle =
    media.type === "show" && media.episodeTitle?.trim()
      ? media.episodeTitle.trim()
      : media.title;

  return (
    <section className="player-details">
      <div className="player-details-main">
        <div className="player-details-heading">
          <h2 className="player-details-title">{displayTitle}</h2>
          {onOpenDetails ? (
            <button
              type="button"
              className="player-details-open-link"
              onClick={onOpenDetails}
              title="Open full details page"
            >
              Full Details
              <span aria-hidden="true">&rarr;</span>
            </button>
          ) : null}
        </div>

        <PlayerMetadataBadges media={media} totalDuration={totalDuration} currentTime={currentTime} />

        <p className="player-details-description">
          {description
            ? description
            : "No description available yet for this title."}
        </p>

        {broadcastEnabled ? (
          <BroadcastViewerList viewers={broadcastViewers} />
        ) : null}
      </div>

      {showKeyboardShortcuts ? (
        <aside
          className="player-details-shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <h3>Shortcuts</h3>
          <dl>
            <div>
              <dt>Space / K</dt>
              <dd>Play / Pause</dd>
            </div>
            <div>
              <dt>J / L</dt>
              <dd>−10s / +10s</dd>
            </div>
            <div>
              <dt>↑ / ↓</dt>
              <dd>Volume</dd>
            </div>
            <div>
              <dt>C</dt>
              <dd>Captions</dd>
            </div>
            <div>
              <dt>M</dt>
              <dd>Mute</dd>
            </div>
            <div>
              <dt>F</dt>
              <dd>Fullscreen</dd>
            </div>
            <div>
              <dt>P</dt>
              <dd>Picture-in-picture</dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </section>
  );
}
