import type { MediaItem } from '../../shared/services/types';
import { formatDuration, toQualityLabel } from '../services/homePageUtils';

interface HomeFeaturedHeroProps {
  heroBackgroundImage: string | null;
  featuredItems: MediaItem[];
  featuredItem: MediaItem | null;
  activeFeaturedIndex: number;
  featuredDescription: string;
  featuredPercent: number | undefined;
  featuredPlayLabel: string;
  onShowPrevious: () => void;
  onShowNext: () => void;
  onSelectFeatured: (index: number) => void;
  onPlay: (mediaId: string) => void;
  onOpenDetails: (mediaId: string) => void;
  onManageLibrary: () => void;
  onHeroInteractionChange?: (active: boolean) => void;
}

export function HomeFeaturedHero({
  heroBackgroundImage,
  featuredItems,
  featuredItem,
  activeFeaturedIndex,
  featuredDescription,
  featuredPercent,
  featuredPlayLabel,
  onShowPrevious,
  onShowNext,
  onSelectFeatured,
  onPlay,
  onOpenDetails,
  onManageLibrary,
  onHeroInteractionChange,
}: HomeFeaturedHeroProps) {
  return (
    <section
      className="hero-banner"
      id="home-featured"
      data-tv-focus-zone="hero"
      style={heroBackgroundImage ? { backgroundImage: `url(${heroBackgroundImage})` } : undefined}
      onMouseEnter={() => onHeroInteractionChange?.(true)}
      onMouseLeave={() => onHeroInteractionChange?.(false)}
      onFocus={() => onHeroInteractionChange?.(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHeroInteractionChange?.(false);
        }
      }}
    >
      <div className="hero-overlay" aria-hidden="true" />

      {featuredItems.length > 1 ? (
        <>
          <button
            type="button"
            className="hero-nav-button hero-nav-button-prev"
            data-tv-focus-priority="low"
            onClick={onShowPrevious}
            aria-label="Show previous featured media"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14.25 5.5L7.75 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="hero-nav-button hero-nav-button-next"
            data-tv-focus-priority="low"
            onClick={onShowNext}
            aria-label="Show next featured media"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.75 5.5L16.25 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      ) : null}

      <div className="hero-content hero-content-transition" key={featuredItem?.id ?? 'featured-empty'}>
        <p className="hero-kicker">
          Featured on Yeen
          {featuredItems.length > 1 ? (
            <span className="hero-rotation-note">{`${activeFeaturedIndex + 1} / ${featuredItems.length}`}</span>
          ) : null}
        </p>
        <h1>{featuredItem ? featuredItem.title : 'No media found yet'}</h1>
        <p className="hero-description">{featuredDescription}</p>

        <div className="hero-meta-strip">
          {featuredItem?.releaseYear ? <span>{featuredItem.releaseYear}</span> : null}
          {featuredItem ? <span>{formatDuration(featuredItem.durationSeconds)}</span> : null}
          {featuredItem ? <span>{toQualityLabel(featuredItem)}</span> : null}
          {featuredItem ? <span>{featuredItem.extension.replace('.', '').toUpperCase()}</span> : null}
        </div>

        <div className="hero-actions" data-tv-focus-lane-id="hero-actions">
          {featuredItem ? (
            <button
              className="accent-button"
              data-tv-initial-focus="true"
              data-tv-focus-key={`home-featured-play:${featuredItem.id}`}
              onClick={() => onPlay(featuredItem.id)}
            >
              {featuredPlayLabel}
            </button>
          ) : null}

          {featuredItem ? (
            <button
              className="ghost-button"
              onClick={() => onOpenDetails(featuredItem.id)}
            >
              More Info
            </button>
          ) : null}

          <button className="ghost-button" onClick={onManageLibrary}>
            Manage Library
          </button>
        </div>

        {typeof featuredPercent === 'number' ? (
          <p className="hero-resume">Resume point: {Math.round(featuredPercent)}%</p>
        ) : null}

        {featuredItems.length > 1 ? (
          <div
            className="hero-featured-switcher"
            role="group"
            aria-label="Choose featured media"
            data-tv-focus-lane-id="hero-switcher"
            data-tv-focus-priority="low"
          >
            {featuredItems.map((item, index) => {
              const isActive = index === activeFeaturedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? 'hero-switch-dot is-active' : 'hero-switch-dot'}
                  data-tv-focus-priority="low"
                  onClick={() => onSelectFeatured(index)}
                  aria-label={`Show featured: ${item.title}`}
                  aria-pressed={isActive}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
