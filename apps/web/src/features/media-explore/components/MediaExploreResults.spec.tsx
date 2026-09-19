import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MediaExploreResults } from './MediaExploreResults';

describe('MediaExploreResults', () => {
  it('loads subsequent catalog pages without presenting a manual Load More control', () => {
    const markup = renderToStaticMarkup(
      <MediaExploreResults
        sectionTitle="Movie & TV Explorer"
        sectionSubtitle="Action titles"
        error={null}
        loading={false}
        filteredItems={[]}
        useCompactResultsGrid={false}
        virtualizedRange={{
          visibleItems: [],
          topSpacerHeight: 0,
          bottomSpacerHeight: 0,
        }}
        resultsViewportRef={createRef<HTMLDivElement>()}
        loadMoreSentinelRef={createRef<HTMLDivElement>()}
        showLoadingMoreIndicator
        loadingMoreLabel="Loading more titles..."
        waitingForRateLimit={false}
        tagFilter="Action"
        hasMore
        onRetry={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    );

    expect(markup).not.toContain('Load More');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Loading more titles...');
  });

  it('keeps an accessible retry action when catalog loading fails', () => {
    const markup = renderToStaticMarkup(
      <MediaExploreResults
        sectionTitle="Movie & TV Explorer"
        sectionSubtitle="Action titles"
        error="Catalog unavailable"
        loading={false}
        filteredItems={[]}
        useCompactResultsGrid={false}
        virtualizedRange={{ visibleItems: [], topSpacerHeight: 0, bottomSpacerHeight: 0 }}
        resultsViewportRef={createRef<HTMLDivElement>()}
        loadMoreSentinelRef={createRef<HTMLDivElement>()}
        showLoadingMoreIndicator={false}
        loadingMoreLabel="Loading more titles..."
        waitingForRateLimit={false}
        tagFilter="Action"
        hasMore={false}
        onRetry={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    );

    expect(markup).toContain('Catalog unavailable');
    expect(markup).toContain('>Retry<');
  });
});
