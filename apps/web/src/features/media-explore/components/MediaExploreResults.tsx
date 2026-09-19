import type { MutableRefObject } from 'react';
import { MediaTile } from '../../library/components/MediaTile';
import type { MediaItem } from '../../shared/services/types';
import { artworkUrlForMedia } from '../../library/services/mediaLibraryUtils';
import type { ExploreVirtualizedRange } from '../services/exploreGrid';

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
  onRetry: () => void;
  onOpenDetails: (mediaId: string) => void;
}

function LoadingMore({ show, label, waiting, tag }: {
  show: boolean; label: string; waiting: boolean; tag: string;
}) {
  if (!show) return null;
  const subtitle = waiting
    ? 'We are pacing requests to avoid provider throttling.'
    : tag ? `Fetching next batch for ${tag}.` : 'Fetching the next batch.';
  return (
    <div className="library-loading-more" role="status" aria-live="polite" aria-label={label}>
      <span className="library-loading-more-spinner" aria-hidden="true" />
      <div className="library-loading-more-copy"><p className="library-loading-more-title">{label}</p>
        <p className="library-loading-more-subtitle">{subtitle}</p>
        <span className="library-loading-more-progress" aria-hidden="true"><span /></span>
      </div>
    </div>
  );
}

function ExploreViewport(props: Omit<
  MediaExploreResultsProps,
  'sectionTitle' | 'sectionSubtitle' | 'error' | 'loading' | 'onRetry'
>) {
  const { filteredItems, hasMore, resultsViewportRef, virtualizedRange, useCompactResultsGrid,
    onOpenDetails, tagFilter, loadMoreSentinelRef, showLoadingMoreIndicator, loadingMoreLabel,
    waitingForRateLimit } = props;
  return (
    <div className="library-results-viewport" ref={resultsViewportRef} data-tv-focus-lane-id="explore-results-grid">
      {virtualizedRange.topSpacerHeight > 0 ? <div className="library-virtual-spacer" style={{ height: `${virtualizedRange.topSpacerHeight}px` }} aria-hidden="true" /> : null}
      <div className={useCompactResultsGrid ? 'library-grid is-compact' : 'library-grid'}>
        {virtualizedRange.visibleItems.map((item) => <MediaTile key={item.id} media={item}
          imageUrl={artworkUrlForMedia(item)} onOpen={onOpenDetails} />)}
      </div>
      {filteredItems.length === 0 ? <article className="library-empty library-empty-remote">
        <h2>No matching {tagFilter ? 'titles loaded yet' : 'results yet'}</h2>
        <p>{hasMore ? 'More catalog pages are available. Keep scrolling to continue with this filter.' : 'Try another tag or media type.'}</p>
      </article> : null}
      {virtualizedRange.bottomSpacerHeight > 0 ? <div className="library-virtual-spacer" style={{ height: `${virtualizedRange.bottomSpacerHeight}px` }} aria-hidden="true" /> : null}
      <div ref={loadMoreSentinelRef} className="library-load-more-sentinel" aria-hidden="true" />
      <LoadingMore show={showLoadingMoreIndicator} label={loadingMoreLabel} waiting={waitingForRateLimit} tag={tagFilter} />
      {!hasMore ? <p className="muted library-feedback">Reached the end of this tag catalog.</p> : null}
    </div>
  );
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
  onRetry,
  onOpenDetails,
}: MediaExploreResultsProps) {
  return (
    <section className="library-section" data-tv-focus-zone="shelf">
      <div className="section-header" data-tv-focus-lane-id="explore-results-heading">
        <h1 className="section-title" tabIndex={-1} data-tv-focus-key="explore-results-title">{sectionTitle}</h1>
        <p className="section-subtitle">{sectionSubtitle}</p>
      </div>

      {error ? (
        <div className="library-feedback" role="alert">
          <p className="error-text">{error}</p>
          <button type="button" className="library-clear-button" onClick={onRetry}>Retry</button>
        </div>
      ) : null}
      {loading ? <p className="muted library-feedback">Loading remote media results...</p> : null}

      {!loading && !error && (filteredItems.length > 0 || hasMore) ? <ExploreViewport
        filteredItems={filteredItems} hasMore={hasMore} resultsViewportRef={resultsViewportRef}
        virtualizedRange={virtualizedRange} useCompactResultsGrid={useCompactResultsGrid}
        onOpenDetails={onOpenDetails} tagFilter={tagFilter} loadMoreSentinelRef={loadMoreSentinelRef}
        showLoadingMoreIndicator={showLoadingMoreIndicator} loadingMoreLabel={loadingMoreLabel}
        waitingForRateLimit={waitingForRateLimit} /> : null}

      {!loading && !error && filteredItems.length === 0 && !hasMore ? (
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
