import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/services/api';
import type { User } from '../../shared/services/types';
import {
  clearCachedAuthenticatedUser,
  readCachedAuthenticatedUser,
  shouldInvalidateAuthenticatedSession,
  writeCachedAuthenticatedUser,
} from './authSessionRecovery';

const user: User = {
  id: 'account-1',
  email: 'listener@example.com',
  name: 'Listener',
  role: 'user',
  invitesRemaining: 0,
  maxBitrateKbps: null,
  invitedByAccountId: null,
  createdAt: '2026-07-19T00:00:00.000Z',
};

describe('authenticated session recovery', () => {
  it('invalidates a session only when the server confirms authorization failed', () => {
    expect(shouldInvalidateAuthenticatedSession(new ApiError('Unauthorized', 401))).toBe(true);
    expect(shouldInvalidateAuthenticatedSession(new ApiError('Forbidden', 403))).toBe(true);
    expect(shouldInvalidateAuthenticatedSession(new ApiError('Server error', 500))).toBe(false);
    expect(shouldInvalidateAuthenticatedSession(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('round-trips the last verified profile for offline startup', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    writeCachedAuthenticatedUser(user, storage);
    expect(readCachedAuthenticatedUser(storage)).toEqual(user);

    clearCachedAuthenticatedUser(storage);
    expect(readCachedAuthenticatedUser(storage)).toBeNull();
  });

  it('ignores malformed cached profiles and unavailable storage', () => {
    expect(readCachedAuthenticatedUser({ getItem: () => '{"id": 42}' })).toBeNull();
    expect(() => writeCachedAuthenticatedUser(user, { setItem: vi.fn(() => {
      throw new Error('quota');
    }) })).not.toThrow();
  });
});
