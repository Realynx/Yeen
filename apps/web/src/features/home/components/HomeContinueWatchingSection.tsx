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
}

export function HomeContinueWatchingSection({
  firstName,
  continueWatching,
  onOpenPlayer,
}: HomeContinueWatchingSectionProps) {
  return (
    <section className="browse-section is-first-row" id="row-continue" data-tv-focus-zone="shelf">
      <h2 className="section-title">Continue Watching for {firstName}</h2>
      <MediaRow focusLaneId="shelf-row-continue">
        {continueWatching.map(({ item, percent }) => (
          <MediaTile
            key={item.id}
            media={item}
            imageUrl={artworkUrlForMedia(item)}
            progressPercent={percent}
            topRightLabel={toSeasonEpisodeLabel(item)}
            onOpen={onOpenPlayer}
          />
        ))}
      </MediaRow>
    </section>
  );
}
