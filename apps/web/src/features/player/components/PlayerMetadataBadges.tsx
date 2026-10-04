import type { MediaItem } from '../../shared/services/types';
import { formatClock, formatDurationLabel, toResolutionBadge } from '../services/playerUtils';

export function PlayerMetadataBadges({ media, totalDuration, currentTime }: {
  media: MediaItem; totalDuration: number; currentTime: number;
}) {
  return (
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
  );
}
