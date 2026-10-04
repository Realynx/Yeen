import type { BroadcastViewerStatus } from "../../shared/services/types";

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

export function BroadcastViewerList({ viewers: broadcastViewers }: { viewers: BroadcastViewerStatus[] }) {
  return (
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
  );
}
