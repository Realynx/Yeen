import { describe, expect, it, vi } from 'vitest';
import {
  mediaModeStorageKey,
  readMediaMode,
  writeMediaMode,
} from './mediaModePreference';

describe('media mode preference', () => {
  it('defaults legacy accounts to video mode', () => {
    expect(readMediaMode('account-1', { getItem: () => null })).toBe('video');
  });

  it('persists music mode per account', () => {
    const setItem = vi.fn();
    writeMediaMode('account-1', 'music', { setItem });

    expect(setItem).toHaveBeenCalledWith(mediaModeStorageKey('account-1'), 'music');
    expect(readMediaMode('account-1', { getItem: () => 'music' })).toBe('music');
  });

  it('keeps remembered modes isolated between accounts', () => {
    const preferences = new Map<string, string>();
    const storage = {
      getItem: (key: string) => preferences.get(key) ?? null,
      setItem: (key: string, value: string) => preferences.set(key, value),
    };

    writeMediaMode('video-account', 'video', storage);
    writeMediaMode('music-account', 'music', storage);

    expect(readMediaMode('video-account', storage)).toBe('video');
    expect(readMediaMode('music-account', storage)).toBe('music');
  });

  it('ignores invalid stored values', () => {
    expect(readMediaMode('account-1', { getItem: () => 'podcasts' })).toBe('video');
  });
});
