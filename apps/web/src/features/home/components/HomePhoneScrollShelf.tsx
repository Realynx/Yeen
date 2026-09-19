import { MediaTile } from '../../library/components/MediaTile';
import { artworkUrlForMedia as libraryArtworkUrlForMedia } from '../../library/services/mediaLibraryUtils';
import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import { toProgressPercent } from '../services/homePageUtils';

interface HomePhoneScrollShelfProps {
  title: string;
  ariaLabel: string;
  items: MediaItem[];
  progressMap: Map<string, ProgressEntry>;
  onOpen: (mediaId: string) => void;
  topRightLabelForItem?: (item: MediaItem) => string | null | undefined;
  actionForItem?: (item: MediaItem) => {
    label: string;
    ariaLabel: string;
    onClick: () => void;
  } | null;
}

export function HomePhoneScrollShelf({
  title,
  ariaLabel,
  items,
  progressMap,
  onOpen,
  topRightLabelForItem,
  actionForItem,
}: HomePhoneScrollShelfProps) {
  return (
    <section className="browse-section phone-home-section">
      <div className="phone-home-shelf-heading">
        <h2 className="section-title">{title}</h2>
      </div>

      <div className="phone-home-scroll-row" role="list" aria-label={ariaLabel}>
        {items.map((item) => {
          const action = actionForItem?.(item) ?? null;
          return (
            <div key={item.id} className="phone-home-scroll-item" role="listitem">
              <MediaTile
                media={item}
                imageUrl={libraryArtworkUrlForMedia(item)}
                progressPercent={toProgressPercent(progressMap.get(item.id))}
                topRightLabel={topRightLabelForItem?.(item)}
                layout="library"
                onOpen={onOpen}
              />
              {action ? (
                <button
                  type="button"
                  className="continue-watching-dismiss"
                  aria-label={action.ariaLabel}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
