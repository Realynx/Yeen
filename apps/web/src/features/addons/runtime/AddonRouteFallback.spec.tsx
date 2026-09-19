import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Navigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AddonRouteFallback } from './AddonRouteFallback';

describe('AddonRouteFallback', () => {
  it('preserves an unmatched path while add-on route discovery is pending', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/downloads']}>
        <AddonRouteFallback loading />
      </MemoryRouter>,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Loading optional add-ons');
  });

  it('redirects a true unknown route after add-on discovery settles', () => {
    const fallback = AddonRouteFallback({ loading: false });

    expect(fallback.type).toBe(Navigate);
    expect(fallback.props).toMatchObject({ replace: true, to: '/' });
  });
});
