import { describe, expect, it } from 'vitest';
import { shouldRefreshPublicBroadcastFallback } from './publicBroadcastStatusFallback';

describe('public broadcast status fallback', () => {
  it('does not poll over a healthy server-sent status stream', () => {
    expect(shouldRefreshPublicBroadcastFallback(18_500, 20_000)).toBe(false);
  });

  it('polls when no stream event has arrived within the stale window', () => {
    expect(shouldRefreshPublicBroadcastFallback(0, 20_000)).toBe(true);
    expect(shouldRefreshPublicBroadcastFallback(1_000, 22_000)).toBe(true);
  });
});
