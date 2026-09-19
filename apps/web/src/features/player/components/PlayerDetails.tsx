import type {
  BroadcastViewerStatus,
  MediaItem,
} from "../../shared/services/types";
import {
  formatClock,
  formatDurationLabel,
  toResolutionBadge,
} from "../services/playerUtils";

interface PlayerDetailsProps {
  media: MediaItem | null;
  totalDuration: number;
  currentTime: number;
  showKeyboardShortcuts?: boolean;
  onOpenDetails?: () => void;
  broadcastEnabled?: boolean;
  broadcastViewers?: BroadcastViewerStatus[];
}

function formatNetworkSpeed(bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) {
    return "Measuring…";
  }

  const megabitsPerSecond = (bytesPerSecond * 8) / 1_000_000;
  if (megabitsPerSecond >= 1) {
    return `${megabitsPerSecond.toFixed(megabitsPerSecond >= 10 ? 0 : 1)} Mbps`;
  }

  return `${Math.max(1, Math.round(bytesPerSecond / 1000))} KB/s`;
}

function formatViewerLocation(viewer: BroadcastViewerStatus): string {
  if (viewer.ipLocationStatus === "private") return "Local or private network";
  if (viewer.ipLocationStatus === "pending") return "Locating IP…";
  if (viewer.ipLocationStatus === "unavailable" || !viewer.ipLocation) {
    return "Approximate location unavailable";
  }

  const location = [
    viewer.ipLocation.city,
    viewer.ipLocation.region,
    viewer.ipLocation.country,
  ].filter((part, index, all): part is string =>
    Boolean(part && all.indexOf(part) === index),
  );
  const locationLabel =
    location.join(", ") || "Approximate location unavailable";
  return viewer.ipLocation.organization
    ? `${locationLabel} · ${viewer.ipLocation.organization}`
    : locationLabel;
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

        <div className="player-details-badges">
          <span>
            {toResolutionBadge(media.width ?? null, media.height ?? null)}
          </span>
          <span>
            {(media.extension ?? "").replace(".", "").toUpperCase() ||
              "Unknown"}
          </span>
          <span>{formatDurationLabel(totalDuration)}</span>
          <span>
            {formatClock(Math.max(totalDuration - currentTime, 0))} left
          </span>
        </div>

        <p className="player-details-description">
          {description
            ? description
            : "No description available yet for this title."}
        </p>

        {broadcastEnabled ? (
          <section
            className="player-broadcast-viewers"
            aria-label="Broadcast viewers"
          >
            <div className="player-broadcast-viewers-heading">
              <h3>Broadcast viewers</h3>
              <span>{broadcastViewers.length} active</span>
            </div>
            {broadcastViewers.length > 0 ? (
              <ul>
                {broadcastViewers.map((viewer) => (
                  <li key={`${viewer.clientType}:${viewer.ipAddress}`}>
                    <span className="player-broadcast-viewer-ip">
                      {viewer.ipAddress}
                    </span>
                    <span className="player-broadcast-viewer-client">
                      {viewer.clientType === "vlc" ? "VLC / HLS" : "Web"}
                    </span>
                    <span className="player-broadcast-viewer-speed">
                      {formatNetworkSpeed(viewer.networkSpeedBytesPerSecond)}
                    </span>
                    <span className="player-broadcast-viewer-location">
                      {formatViewerLocation(viewer)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No active viewers yet.</p>
            )}
          </section>
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
