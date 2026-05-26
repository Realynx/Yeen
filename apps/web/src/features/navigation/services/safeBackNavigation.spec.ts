import { describe, expect, it } from 'vitest';
import {
  canNavigateBackWithinApp,
  resolveSafeBackFallbackPath,
} from './safeBackNavigation';

describe('safeBackNavigation', () => {
  it('does not trust the initial browser history entry as in-app back stack', () => {
    expect(canNavigateBackWithinApp('default')).toBe(false);
    expect(canNavigateBackWithinApp('route-key')).toBe(true);
  });

  it('falls back from direct player and details deep links without leaving Yeen', () => {
    expect(resolveSafeBackFallbackPath('/player/media-1')).toBe('/details/media-1');
    expect(resolveSafeBackFallbackPath('/details/media-1')).toBe('/library');
  });

  it('keeps top-level Back inside the app until the Home Feed root', () => {
    expect(resolveSafeBackFallbackPath('/library')).toBe('/');
    expect(resolveSafeBackFallbackPath('/explore')).toBe('/');
    expect(resolveSafeBackFallbackPath('/')).toBeNull();
  });
});
