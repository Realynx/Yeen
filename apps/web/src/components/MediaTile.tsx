import { useState } from 'react';
import type { MediaItem } from '../lib/types';

interface MediaTileProps {
  media: MediaItem;
  imageUrl?: string | null;
  progressPercent?: number;
  onOpen: (mediaId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectionToggle?: (
    mediaId: string,
    modifiers: { shift: boolean },
  ) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function toQualityLabel(media: MediaItem): string {
  if (!media.height) {
    return 'SD';
  }

  if (media.height >= 2160) {
    return '4K';
  }

  if (media.height >= 1080) {
    return 'HD';
  }

  if (media.height >= 720) {
    return '720p';
  }

  return `${media.height}p`;
}

export function MediaTile({
  media,
  imageUrl,
  progressPercent,
  onOpen,
  selectable = false,
  selected = false,
  onSelectionToggle,
}: MediaTileProps) {
  const currentImageUrl = imageUrl ?? null;
  const quality = media.width && media.height ? `${media.width}x${media.height}` : 'Unknown quality';
  const qualityBadge = toQualityLabel(media);
  const typeLabel = media.type === 'show' ? 'Series' : 'Movie';

  const description = media.description?.trim()
    || `${typeLabel} from ${media.relativePath}`;

  const safeProgressPercent = typeof progressPercent === 'number'
    ? Math.max(0, Math.min(100, progressPercent))
    : null;

  const [loadedArtworkState, setLoadedArtworkState] = useState<{
    imageUrl: string | null;
    isPortrait: boolean;
  }>({
    imageUrl: null,
    isPortrait: false,
  });

  const portraitArtwork = loadedArtworkState.imageUrl === currentImageUrl
    && loadedArtworkState.isPortrait;

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      setLoadedArtworkState({ imageUrl: currentImageUrl, isPortrait: false });
      return;
    }

    setLoadedArtworkState({
      imageUrl: currentImageUrl,
      isPortrait: naturalHeight / naturalWidth > 1.12,
    });
  }

  return (
    <button
      type="button"
      className={
        selectable
          ? selected
            ? 'media-tile is-selectable is-selected'
            : 'media-tile is-selectable'
          : 'media-tile'
      }
      onMouseDown={(event) => {
        // Prevent native text selection when shift-clicking tiles.
        if (selectable && event.shiftKey) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        if (selectable) {
          onSelectionToggle?.(media.id, { shift: event.shiftKey });
        } else {
          onOpen(media.id);
        }
      }}
    >
      {selectable ? (
        <span className="media-tile-checkbox" aria-hidden="true">
          {selected ? '✓' : ''}
        </span>
      ) : null}
      <div className="media-thumb" aria-hidden="true">
        {imageUrl ? (
          <>
            <div
              className={portraitArtwork ? 'media-thumb-backdrop is-visible' : 'media-thumb-backdrop'}
              style={portraitArtwork ? { backgroundImage: `url("${imageUrl}")` } : undefined}
            />
            <img
              src={imageUrl}
              alt={media.title}
              loading="lazy"
              decoding="async"
              className={portraitArtwork ? 'media-thumb-image is-portrait' : 'media-thumb-image'}
              onLoad={handleImageLoad}
              onError={() => setLoadedArtworkState({ imageUrl: currentImageUrl, isPortrait: false })}
            />
          </>
        ) : (
          <>
            <div className="media-glow" />
            <span>{media.title.slice(0, 1).toUpperCase()}</span>
          </>
        )}

        <div className="media-thumb-shade" />

        {safeProgressPercent !== null ? (
          <div className="progress-bar" aria-hidden="true">
            <div style={{ width: `${safeProgressPercent}%` }} />
          </div>
        ) : null}
      </div>

      <div className="media-hover-panel">
        <h3 className="media-hover-title" title={media.title}>{media.title}</h3>

        <div className="media-hover-body">
          <div className="media-badges" aria-hidden="true">
            <span>{formatDuration(media.durationSeconds)}</span>
            <span>{qualityBadge}</span>
            {media.releaseYear ? <span>{media.releaseYear}</span> : null}
            <span>{media.extension.replace('.', '').toUpperCase()}</span>
          </div>

          <p className="media-hover-description">{description}</p>
          <p className="media-hover-tech">{quality} | {typeLabel}</p>
        </div>
      </div>
    </button>
  );
}
