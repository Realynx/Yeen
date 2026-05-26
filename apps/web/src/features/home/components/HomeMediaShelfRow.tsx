import { MediaRow } from '../../library/components/MediaRow';
import { MediaTile } from '../../library/components/MediaTile';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import { artworkUrlForMedia, toProgressPercent } from '../services/homePageUtils';

interface HomeMediaShelfRowProps {
  id: string;
  className: string;
  title: string;
  items: MediaItem[];
  progressMap: ReadonlyMap<string, ProgressEntry>;
  onOpen: (mediaId: string) => void;
  onViewAll?: () => void;
}

export function HomeMediaShelfRow({
  id,
  className,
  title,
  items,
  progressMap,
  onOpen,
  onViewAll,
}: HomeMediaShelfRowProps) {
  return (
    <section className={className} id={id} data-tv-focus-zone="shelf">
      <div className="home-shelf-heading">
        <h2 className="section-title">{title}</h2>
        {onViewAll ? (
          <button
            type="button"
            className="home-shelf-view-all"
            data-tv-focus-lane-id={`shelf-${id}-actions`}
            data-tv-focus-priority="low"
            onClick={onViewAll}
          >
            View All
          </button>
        ) : null}
      </div>
      <MediaRow focusLaneId={`shelf-${id}`}>
        {items.map((item) => (
          <MediaTile
            key={item.id}
            media={item}
            imageUrl={artworkUrlForMedia(item)}
            progressPercent={toProgressPercent(progressMap.get(item.id))}
            onOpen={onOpen}
          />
        ))}
      </MediaRow>
    </section>
  );
}
