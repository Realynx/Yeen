import type { MediaItem, ProgressEntry } from '../../../shared/services/types';
import {
  formatDuration,
  isResumableProgress,
  previewImageUrl,
  progressPercent,
} from '../../services/mediaDetailsUtils';

interface SeriesCollectionSectionProps {
  current: MediaItem;
  relatedMovies: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditMovie?: (movie: MediaItem) => void;
}

export function SeriesCollectionSection({
  current,
  relatedMovies,
  progressById,
  onNavigate,
  isAdmin,
  onEditMovie,
}: SeriesCollectionSectionProps) {
  return (
    <section>
      <h3 className="section-title">In This Collection</h3>
      <p className="section-subtitle">
        Related movies grouped by title and franchise.
      </p>
      <div className="series-grid">
        {relatedMovies.map((movie) => {
          const movieImage = previewImageUrl(movie);
          const movieProgress = progressById.get(movie.id);
          const moviePercent = progressPercent(movieProgress);
          const isCurrent = movie.id === current.id;

          return (
            <div
              key={movie.id}
              className={`series-card${isCurrent ? ' is-current' : ''}`}
              onClick={() => onNavigate(`/details/${movie.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  onNavigate(`/details/${movie.id}`);
                }
              }}
            >
              <div className="series-card-thumb" aria-hidden="true">
                {movieImage ? (
                  <img src={movieImage} alt={movie.title} loading="lazy" decoding="async" />
                ) : (
                  <span>{movie.title.slice(0, 1).toUpperCase()}</span>
                )}
                {isResumableProgress(movieProgress) ? (
                  <div className="episode-progress" aria-hidden="true">
                    <div style={{ width: `${moviePercent}%` }} />
                  </div>
                ) : null}
                {movieProgress?.completed ? (
                  <span className="episode-watched-badge">✓</span>
                ) : null}
              </div>
              <h4>{movie.title}</h4>
              <p>
                {movie.releaseYear ?? 'Unknown year'} · {formatDuration(movie.durationSeconds)}
              </p>
              {isAdmin && onEditMovie ? (
                <button
                  type="button"
                  className="series-card-edit-btn"
                  aria-label={`Edit metadata for ${movie.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditMovie(movie);
                  }}
                >
                  ✎ Edit
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
