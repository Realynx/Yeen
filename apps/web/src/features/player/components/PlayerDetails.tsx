import type { MediaItem } from '../../shared/services/types';
import { formatClock, formatDurationLabel, toResolutionBadge } from '../services/playerUtils';

interface PlayerDetailsProps {
  media: MediaItem | null;
  totalDuration: number;
  currentTime: number;
  showKeyboardShortcuts?: boolean;
  onOpenDetails?: () => void;
}

export function PlayerDetails({
  media,
  totalDuration,
  currentTime,
  showKeyboardShortcuts = true,
  onOpenDetails,
}: PlayerDetailsProps) {
  if (!media) {
    return null;
  }

  const description = media.description?.trim();
  const displayTitle =
    media.type === 'show' && media.episodeTitle?.trim()
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
          <span>{toResolutionBadge(media.width ?? null, media.height ?? null)}</span>
          <span>{(media.extension ?? '').replace('.', '').toUpperCase() || 'Unknown'}</span>
          <span>{formatDurationLabel(totalDuration)}</span>
          <span>{formatClock(Math.max(totalDuration - currentTime, 0))} left</span>
        </div>

        <p className="player-details-description">
          {description ? description : 'No description available yet for this title.'}
        </p>
      </div>

      {showKeyboardShortcuts ? (
        <aside className="player-details-shortcuts" aria-label="Keyboard shortcuts">
          <h3>Shortcuts</h3>
          <dl>
            <div><dt>Space / K</dt><dd>Play / Pause</dd></div>
            <div><dt>J / L</dt><dd>−10s / +10s</dd></div>
            <div><dt>↑ / ↓</dt><dd>Volume</dd></div>
            <div><dt>C</dt><dd>Captions</dd></div>
            <div><dt>M</dt><dd>Mute</dd></div>
            <div><dt>F</dt><dd>Fullscreen</dd></div>
            <div><dt>P</dt><dd>Picture-in-picture</dd></div>
          </dl>
        </aside>
      ) : null}
    </section>
  );
}
