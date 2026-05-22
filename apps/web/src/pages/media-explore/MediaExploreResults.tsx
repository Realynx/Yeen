import type { MutableRefObject } from 'react';
import { MediaTile } from '../../components/MediaTile';
import type { MediaItem } from '../../lib/types';
import { artworkUrlForMedia } from '../mediaLibraryUtils';
import type { ExploreVirtualizedRange } from './exploreGrid';

interface MediaExploreResultsProps {
  sectionTitle: string;
  sectionSubtitle: string;
  error: string | null;
  loading: boolean;
  filteredItems: MediaItem[];
  useCompactResultsGrid: boolean;
  virtualizedRange: ExploreVirtualizedRange;
  resultsViewportRef: MutableRefObject<HTMLDivElement | null>;
  loadMoreSentinelRef: MutableRefObject<HTMLDivElement | null>;
  showLoadingMoreIndicator: boolean;
  loadingMoreLabel: string;
  waitingForRateLimit: boolean;
  tagFilter: string;
  hasMore: boolean;
  onOpenDetails: (mediaId: string) => void;
}

export function MediaExploreResults({
  sectionTitle,
  sectionSubtitle,
  error,
  loading,
  filteredItems,
  useCompactResultsGrid,
  virtualizedRange,
  resultsViewportRef,
  loadMoreSentinelRef,
  showLoadingMoreIndicator,
  loadingMoreLabel,
  waitingForRateLimit,
  tagFilter,
  hasMore,
  onOpenDetails,
}: MediaExploreResultsProps) {
  return (
    <section className="library-section">
      <div className="section-header">
        <h1 className="section-title">{sectionTitle}</h1>
        <p className="section-subtitle">{sectionSubtitle}</p>
      </div>

      {error ? <p className="error-text library-feedback">{error}</p> : null}
      {loading ? <p className="muted library-feedback">Loading remote media results...</p> : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <div className="library-results-viewport" ref={resultsViewportRef}>
          {virtualizedRange.topSpacerHeight > 0 ? (
            <div
              className="library-virtual-spacer"
              style={{ height: `${virtualizedRange.topSpacerHeight}px` }}
              aria-hidden="true"
            />
          ) : null}

          <div className={useCompactResultsGrid ? 'library-grid is-compact' : 'library-grid'}>
            {virtualizedRange.visibleItems.map((item) => (
              <MediaTile
                key={item.id}
                media={item}
                imageUrl={artworkUrlForMedia(item)}
                onOpen={onOpenDetails}
              />
            ))}
          </div>

          {virtualizedRange.bottomSpacerHeight > 0 ? (
            <div
              className="library-virtual-spacer"
              style={{ height: `${virtualizedRange.bottomSpacerHeight}px` }}
              aria-hidden="true"
            />
          ) : null}

          <div ref={loadMoreSentinelRef} className="library-load-more-sentinel" aria-hidden="true" />

          {showLoadingMoreIndicator ? (
            <div
              className="library-loading-more"
              role="status"
              aria-live="polite"
              aria-label={loadingMoreLabel}
            >
              <span className="library-loading-more-spinner" aria-hidden="true" />
              <div className="library-loading-more-copy">
                <p className="library-loading-more-title">{loadingMoreLabel}</p>
                <p className="library-loading-more-subtitle">
                  {waitingForRateLimit
                    ? 'We are pacing requests to avoid provider throttling.'
                    : tagFilter
                      ? `Fetching next batch for ${tagFilter}.`
                      : 'Fetching the next batch.'}
                </p>
                <span className="library-loading-more-progress" aria-hidden="true">
                  <span />
                </span>
              </div>
            </div>
          ) : null}

          {!hasMore ? (
            <p className="muted library-feedback">Reached the end of this tag catalog.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <article className="library-empty library-empty-remote">
          <h2>No results yet</h2>
          <p>
            Pick a tag to explore titles in the selected catalog.
          </p>
        </article>
      ) : null}
    </section>
  );
}
