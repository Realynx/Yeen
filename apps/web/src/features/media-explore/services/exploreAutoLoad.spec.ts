import { describe, expect, it } from 'vitest';
import { shouldAutoLoadExplorePage } from './exploreAutoLoad';

describe('shouldAutoLoadExplorePage', () => {
  it('allows only an intersecting, unlocked catalog with another page', () => {
    const ready = {
      isIntersecting: true,
      intersectionRatio: 0.25,
      minimumIntersectionRatio: 0.2,
      loading: false,
      loadingMore: false,
      hasMore: true,
      locked: false,
      tagFilter: 'Action',
    };

    expect(shouldAutoLoadExplorePage(ready)).toBe(true);
    expect(shouldAutoLoadExplorePage({ ...ready, loadingMore: true })).toBe(false);
    expect(shouldAutoLoadExplorePage({ ...ready, locked: true })).toBe(false);
    expect(shouldAutoLoadExplorePage({ ...ready, hasMore: false })).toBe(false);
    expect(shouldAutoLoadExplorePage({ ...ready, tagFilter: '' })).toBe(false);
    expect(shouldAutoLoadExplorePage({ ...ready, intersectionRatio: 0.1 })).toBe(false);
  });
});
