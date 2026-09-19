import { describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '../../shared/services/types';
import {
  accessTokenExpiresAtMs,
  createRollingSessionRefresher,
  shouldRefreshAccessToken,
} from './rollingAuthSession';

function tokenExpiringAt(expirySeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expirySeconds }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

const refreshedResponse = {
  accessToken: 'fresh-token',
  user: {
    id: 'account-1', email: 'viewer@example.com', name: 'Viewer', role: 'user',
    invitesRemaining: 0, maxBitrateKbps: null, invitedByAccountId: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  },
} satisfies AuthResponse;

describe('rolling auth session', () => {
  it('reads JWT expiry and renews only inside the refresh window', () => {
    const nowMs = Date.UTC(2026, 7, 24, 12, 0, 0);
    const nearExpiry = tokenExpiringAt((nowMs + 30 * 60 * 1000) / 1000);
    const laterExpiry = tokenExpiringAt((nowMs + 2 * 60 * 60 * 1000) / 1000);

    expect(accessTokenExpiresAtMs(nearExpiry)).toBe(nowMs + 30 * 60 * 1000);
    expect(shouldRefreshAccessToken(nearExpiry, nowMs)).toBe(true);
    expect(shouldRefreshAccessToken(laterExpiry, nowMs)).toBe(false);
    expect(shouldRefreshAccessToken('not-a-jwt', nowMs)).toBe(false);
  });

  it('deduplicates playback activity while renewal is in flight', async () => {
    const nowMs = Date.UTC(2026, 7, 24, 12, 0, 0);
    const token = tokenExpiringAt((nowMs + 30 * 60 * 1000) / 1000);
    let resolveRefresh!: (response: AuthResponse) => void;
    const refresh = vi.fn(() => new Promise<AuthResponse>((resolve) => {
      resolveRefresh = resolve;
    }));
    const onRefreshed = vi.fn();
    const refresher = createRollingSessionRefresher({
      getToken: () => token,
      refresh,
      onRefreshed,
      now: () => nowMs,
    });

    const first = refresher.refreshIfNeeded();
    const second = refresher.refreshIfNeeded();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh(refreshedResponse);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(onRefreshed).toHaveBeenCalledWith(refreshedResponse);
  });
});
