import { afterEach, describe, expect, it } from 'vitest';
import { RUNTIME_API_BASE_STORAGE_KEY, withAccessToken } from './api-core';

describe('authenticated media URLs', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('adds authentication and an origin when production uses a relative API base', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://yeen.home/player/media-1',
          origin: 'https://yeen.home',
        },
        localStorage: {
          getItem: (key: string) =>
            key === RUNTIME_API_BASE_STORAGE_KEY ? '/api' : null,
        },
      },
    });

    expect(withAccessToken('/api/stream/media-1/direct', 'signed token')).toBe(
      'https://yeen.home/api/stream/media-1/direct?access_token=signed+token',
    );
  });
});
