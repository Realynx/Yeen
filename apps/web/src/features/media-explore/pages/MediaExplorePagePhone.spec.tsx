import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhoneExploreResults } from './MediaExplorePagePhone';

describe('PhoneExploreResults', () => {
  it('uses an automatic sentinel instead of a manual Load More button', () => {
    const markup = renderToStaticMarkup(
      <PhoneExploreResults
        items={[]}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore
        compact={false}
        sectionTitle="Movie & TV Explorer"
        sectionSubtitle="Action titles"
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        loadMoreSentinelRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(markup).toContain('library-load-more-sentinel');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('Load More');
  });

  it('retains a retry action when the phone catalog request fails', () => {
    const markup = renderToStaticMarkup(
      <PhoneExploreResults
        items={[]}
        loading={false}
        loadingMore={false}
        error="Catalog unavailable"
        hasMore={false}
        compact={false}
        sectionTitle="Movie & TV Explorer"
        sectionSubtitle="Action titles"
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        loadMoreSentinelRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(markup).toContain('Catalog unavailable');
    expect(markup).toContain('>Retry<');
  });
});
