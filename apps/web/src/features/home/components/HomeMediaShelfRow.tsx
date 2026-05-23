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
}

export function HomeMediaShelfRow({
  id,
  className,
  title,
  items,
  progressMap,
  onOpen,
}: HomeMediaShelfRowProps) {
  return (
    <section className={className} id={id}>
      <h2 className="section-title">{title}</h2>
      <MediaRow>
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
