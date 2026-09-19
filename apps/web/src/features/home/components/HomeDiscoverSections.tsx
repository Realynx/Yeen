import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import type { TaggedMovieRow } from '../services/homePageUtils';
import { HomeMediaShelfRow } from './HomeMediaShelfRow';

interface HomeDiscoverSectionsProps {
  discoverItems: MediaItem[];
  movieRowsByTag: TaggedMovieRow[];
  progressMap: Map<string, ProgressEntry>;
  onOpenDetails: (mediaId: string) => void;
}

export function HomeDiscoverSections({
  discoverItems,
  movieRowsByTag,
  progressMap,
  onOpenDetails,
}: HomeDiscoverSectionsProps) {
  return (
    <>
      {discoverItems.length > 0 ? (
        <HomeMediaShelfRow
          className="browse-section"
          id="row-discover"
          title="Discover"
          items={discoverItems}
          progressMap={progressMap}
          onOpen={onOpenDetails}
        />
      ) : null}

      {movieRowsByTag.map((row) => (
        <HomeMediaShelfRow
          key={row.id}
          className="browse-section"
          id={row.id}
          title={row.label}
          items={row.items}
          progressMap={progressMap}
          onOpen={onOpenDetails}
        />
      ))}
    </>
  );
}
