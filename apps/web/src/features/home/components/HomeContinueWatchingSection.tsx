import { MediaRow } from '../../library/components/MediaRow';
import { MediaTile } from '../../library/components/MediaTile';
import type { MediaItem } from '../../shared/services/types';
import { artworkUrlForMedia, toSeasonEpisodeLabel } from '../services/homePageUtils';

interface ContinueWatchingEntry {
  item: MediaItem;
  percent: number;
}

interface HomeContinueWatchingSectionProps {
  firstName: string;
  continueWatching: ContinueWatchingEntry[];
  onOpenPlayer: (mediaId: string) => void;
  onDismiss: (mediaId: string) => void;
}

export function HomeContinueWatchingSection({
  firstName,
  continueWatching,
  onOpenPlayer,
  onDismiss,
}: HomeContinueWatchingSectionProps) {
  return (
    <section className="browse-section is-first-row" id="row-continue" data-tv-focus-zone="shelf">
      <h2 className="section-title">Continue Watching for {firstName}</h2>
      <MediaRow focusLaneId="shelf-row-continue">
        {continueWatching.map(({ item, percent }) => (
          <div className="continue-watching-tile" key={item.id}>
            <MediaTile
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              progressPercent={percent}
              topRightLabel={toSeasonEpisodeLabel(item)}
              onOpen={onOpenPlayer}
            />
            <button
              type="button"
              className="continue-watching-dismiss"
              data-tv-focus-key={`continue-dismiss:${item.id}`}
              aria-label={`Remove ${item.title} from Continue Watching`}
              onClick={() => onDismiss(item.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </MediaRow>
    </section>
  );
}
