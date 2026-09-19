import { mediaPreviewImageUrl } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';

interface MusicArtworkProps {
  item: MediaItem;
  className?: string;
}

export function MusicArtwork({ item, className = '' }: MusicArtworkProps) {
  const artworkUrl = item.previewImagePath
    ? mediaPreviewImageUrl(item.id, item.metadataRefreshedAt || item.updatedAt)
    : null;

  return (
    <div className={`music-artwork ${className}`.trim()}>
      {artworkUrl ? <img src={artworkUrl} alt="" loading="lazy" /> : (
        <span aria-hidden="true">♫</span>
      )}
    </div>
  );
}
