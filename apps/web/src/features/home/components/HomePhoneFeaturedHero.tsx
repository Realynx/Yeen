import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MediaItem } from '../../shared/services/types';

interface HeroPanelDot {
  id: string;
  kind: 'install' | 'media';
}

interface HomePhoneFeaturedHeroProps {
  featuredBackground: string | null;
  activeIsInstallPanel: boolean;
  featuredItem: MediaItem | null;
  featuredDescription: string;
  featuredProgressLabel: string;
  installPanelDescription: string;
  installPanelStatus: string;
  hasInstallPrompt: boolean;
  panelDots: HeroPanelDot[];
  activeFeaturedIndex: number;
  onSelectFeatured: (index: number) => void;
  onInstallPwa: () => void;
  onOpenPlayer: (mediaId: string) => void;
  onOpenDetails: (mediaId: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function HomePhoneFeaturedHero({
  featuredBackground,
  activeIsInstallPanel,
  featuredItem,
  featuredDescription,
  featuredProgressLabel,
  installPanelDescription,
  installPanelStatus,
  hasInstallPrompt,
  panelDots,
  activeFeaturedIndex,
  onSelectFeatured,
  onInstallPwa,
  onOpenPlayer,
  onOpenDetails,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: HomePhoneFeaturedHeroProps) {
  return (
    <section
      className="phone-featured-hero"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={
        featuredBackground
          ? ({ ['--phone-featured-image' as string]: `url("${featuredBackground}")` })
          : undefined
      }
    >
      <div className="phone-featured-overlay" aria-hidden="true" />

      {activeIsInstallPanel ? (
        <div className="phone-featured-content">
          <p className="eyebrow">Install App</p>
          <h2>Install Yeen on your phone</h2>
          <p className="muted">{installPanelDescription}</p>

          <div className="phone-featured-actions">
            <button
              type="button"
              className="accent-button"
              onClick={onInstallPwa}
            >
              {hasInstallPrompt ? 'Install Yeen' : 'How to Install'}
            </button>
          </div>

          <p className="phone-featured-progress">{installPanelStatus}</p>

          {panelDots.length > 1 ? (
            <div className="phone-featured-pagination" role="group" aria-label="Featured items">
              {panelDots.map((panel, index) => {
                const isActive = index === activeFeaturedIndex;

                return (
                  <button
                    key={panel.id}
                    type="button"
                    className={isActive ? 'phone-featured-dot is-active' : 'phone-featured-dot'}
                    onClick={() => onSelectFeatured(index)}
                    aria-label={panel.kind === 'install' ? 'Show install panel' : `Show featured item ${index + 1}`}
                    aria-pressed={isActive}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : featuredItem ? (
        <div className="phone-featured-content">
          <p className="eyebrow">Featured Pick</p>
          <h2>{featuredItem.title}</h2>
          <p className="muted">{featuredDescription}</p>

          <div className="phone-featured-actions">
            <button
              type="button"
              className="accent-button"
              onClick={() => onOpenPlayer(featuredItem.id)}
            >
              Play
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onOpenDetails(featuredItem.id)}
            >
              Details
            </button>
          </div>

          <p className="phone-featured-progress">{featuredProgressLabel}</p>

          {panelDots.length > 1 ? (
            <div className="phone-featured-pagination" role="group" aria-label="Featured items">
              {panelDots.map((panel, index) => {
                const isActive = index === activeFeaturedIndex;

                return (
                  <button
                    key={panel.id}
                    type="button"
                    className={isActive ? 'phone-featured-dot is-active' : 'phone-featured-dot'}
                    onClick={() => onSelectFeatured(index)}
                    aria-label={panel.kind === 'install' ? 'Show install panel' : `Show featured item ${index + 1}`}
                    aria-pressed={isActive}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="phone-featured-content">
          <p className="eyebrow">Featured Pick</p>
          <h2>Nothing queued yet</h2>
          <p className="muted">Run a library scan in settings to start surfacing titles here.</p>
        </div>
      )}
    </section>
  );
}
