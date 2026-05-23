import { MediaTile } from './MediaTile';
import type { MediaItem } from '../../shared/services/types';
import { artworkUrlForMedia } from '../services/mediaLibraryUtils';

interface MediaLibraryRemoteResultsSectionProps {
  activeSearch: string | null;
  manageMode: boolean;
  remoteError: string | null;
  remoteLoading: boolean;
  remoteItems: MediaItem[];
  onOpenDetails: (mediaId: string) => void;
}

export function MediaLibraryRemoteResultsSection({
  activeSearch,
  manageMode,
  remoteError,
  remoteLoading,
  remoteItems,
  onOpenDetails,
}: MediaLibraryRemoteResultsSectionProps) {
  if (!activeSearch || manageMode) {
    return null;
  }

  const useCompactRemoteGrid = remoteItems.length > 0 && remoteItems.length < 6;

  return (
    <section className="browse-section library-results library-remote-results">
      <div className="section-heading-row">
        <h2 className="section-title">Outside Your Library</h2>
        <p className="section-subtitle">
          Matching titles from TMDB and Jikan that are not indexed locally.
        </p>
      </div>

      {remoteError ? <p className="error-text library-feedback">{remoteError}</p> : null}
      {remoteLoading ? (
        <p className="muted library-feedback">Searching external media catalogs...</p>
      ) : null}

      {!remoteLoading && !remoteError && remoteItems.length > 0 ? (
        <div className={useCompactRemoteGrid ? 'library-grid is-compact' : 'library-grid'}>
          {remoteItems.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              imageUrl={artworkUrlForMedia(item)}
              layout="library"
              onOpen={onOpenDetails}
            />
          ))}
        </div>
      ) : null}

      {!remoteLoading && !remoteError && remoteItems.length === 0 ? (
        <article className="library-empty library-empty-remote">
          <h2>No external matches yet</h2>
          <p>
            Try a broader title or fewer filters to discover media outside your local index.
          </p>
        </article>
      ) : null}
    </section>
  );
}
