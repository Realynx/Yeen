import type { MediaItem } from '../../../shared/services/types';
import { mediaChapterThumbnailUrl } from '../../../shared/services/api';
import { formatTimestamp } from '../../services/mediaDetailsUtils';

interface ScenePreviewsSectionProps {
  current: MediaItem;
  onNavigate: (to: string) => void;
}

export function ScenePreviewsSection({
  current,
  onNavigate,
}: ScenePreviewsSectionProps) {
  if (current.chapterThumbnails.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="section-title">Scene Previews</h3>
      <p className="section-subtitle">
        Jump straight into a moment - preview frames captured during scanning.
      </p>
      <div className="chapter-grid">
        {current.chapterThumbnails.map((thumbnail, index) => (
          <button
            key={`${current.id}-chapter-${index}`}
            type="button"
            className="chapter-thumb"
            onClick={() => {
              const targetSecond = Math.max(0, Math.floor(thumbnail.second));
              onNavigate(`/player/${current.id}?t=${targetSecond}`);
            }}
            title={`Jump near ${formatTimestamp(thumbnail.second)}`}
          >
            <img
              src={mediaChapterThumbnailUrl(current.id, index)}
              alt={`${current.title} chapter ${index + 1}`}
              loading="lazy"
              decoding="async"
            />
            <span>{formatTimestamp(thumbnail.second)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
