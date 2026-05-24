const SKELETON_ROW_COUNT = 3;
const SKELETON_TILE_COUNT = 6;

export function HomeLoadingSkeleton() {
  return (
    <section className="home-loading-skeleton" role="status" aria-live="polite" aria-busy="true">
      <div className="home-loading-hero" aria-hidden="true">
        <span className="home-skeleton-block home-loading-hero-kicker" />
        <span className="home-skeleton-block home-loading-hero-title" />
        <span className="home-skeleton-block home-loading-hero-title home-loading-hero-title-secondary" />
        <span className="home-skeleton-block home-loading-hero-description" />
        <span className="home-skeleton-block home-loading-hero-description home-loading-hero-description-secondary" />

        <div className="home-loading-hero-actions">
          <span className="home-skeleton-block home-loading-hero-action" />
          <span className="home-skeleton-block home-loading-hero-action home-loading-hero-action-secondary" />
        </div>
      </div>

      <p className="home-loading-copy">Loading your media shelf...</p>

      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <section
          key={`home-skeleton-row-${rowIndex}`}
          className={rowIndex === 0 ? 'browse-section is-first-row home-loading-row' : 'browse-section home-loading-row'}
          aria-hidden="true"
        >
          <span className="home-skeleton-block home-loading-section-title" />

          <div className="home-loading-media-row">
            {Array.from({ length: SKELETON_TILE_COUNT }, (_, tileIndex) => (
              <span
                key={`home-skeleton-row-${rowIndex}-tile-${tileIndex}`}
                className="home-skeleton-block home-loading-tile"
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}