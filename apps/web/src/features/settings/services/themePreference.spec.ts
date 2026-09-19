import { describe, expect, it, vi } from 'vitest';
import {
  activateThemePreference,
  applyThemePreference,
  DEFAULT_THEME_ID,
  normalizeThemeId,
  readThemePreference,
  themePreferenceStorageKey,
  writeThemePreference,
} from './themePreference';

class FakeThemeTarget {
  values = new Map<string, string>();
  listeners = new Set<(event: StorageEvent) => void>();
  localStorage = {
    getItem: (key: string) => this.values.get(key) ?? null,
    setItem: (key: string, value: string) => { this.values.set(key, value); },
  };
  addEventListener(_type: 'storage', listener: (event: StorageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'storage', listener: (event: StorageEvent) => void) {
    this.listeners.delete(listener);
  }
  dispatch(key: string | null, newValue: string | null) {
    for (const listener of this.listeners) {
      listener({ key, newValue } as StorageEvent);
    }
  }
}

function createRoot() {
  return { dataset: {} as DOMStringMap };
}

describe('theme preference', () => {
  it('normalizes supported identifiers and safely defaults unknown values', () => {
    expect(normalizeThemeId('current')).toBe('current');
    expect(normalizeThemeId('netflix')).toBe('netflix');
    expect(normalizeThemeId('obsidian-purple')).toBe('obsidian-purple');
    expect(normalizeThemeId('NETFLIX')).toBe(DEFAULT_THEME_ID);
    expect(normalizeThemeId(null)).toBe(DEFAULT_THEME_ID);
  });

  it('creates account-scoped keys without allowing account ids to alter the key shape', () => {
    expect(themePreferenceStorageKey(' account/one ')).toBe(
      'yeen_theme_preference_v1:account%2Fone',
    );
    expect(themePreferenceStorageKey('   ')).toBeNull();
  });

  it('reads only the requested account preference', () => {
    const target = new FakeThemeTarget();
    target.values.set(themePreferenceStorageKey('one')!, 'netflix');
    target.values.set(themePreferenceStorageKey('two')!, 'obsidian-purple');

    expect(readThemePreference('one', target.localStorage)).toBe('netflix');
    expect(readThemePreference('two', target.localStorage)).toBe('obsidian-purple');
    expect(readThemePreference('three', target.localStorage)).toBe('current');
  });

  it('writes a normalized value and applies it to the document root', () => {
    const target = new FakeThemeTarget();
    const root = createRoot();

    expect(writeThemePreference('account', 'netflix', { target, root })).toBe('netflix');
    expect(target.values.get(themePreferenceStorageKey('account')!)).toBe('netflix');
    expect(root.dataset.yeenTheme).toBe('netflix');

    expect(writeThemePreference('account', 'invalid', { target, root })).toBe('current');
    expect(root.dataset.yeenTheme).toBe('current');
  });

  it('still applies a theme when persistence is unavailable', () => {
    const root = createRoot();
    const target = new FakeThemeTarget();
    target.localStorage.setItem = vi.fn(() => { throw new Error('blocked'); });

    expect(writeThemePreference('account', 'obsidian-purple', { target, root })).toBe(
      'obsidian-purple',
    );
    expect(root.dataset.yeenTheme).toBe('obsidian-purple');
  });

  it('falls back safely when browser storage itself cannot be accessed', () => {
    const root = createRoot();
    const blockedTarget = {
      get localStorage(): never {
        throw new Error('blocked');
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const stop = activateThemePreference('account', undefined, {
      target: blockedTarget,
      root,
    });

    expect(root.dataset.yeenTheme).toBe('current');
    stop();
  });

  it('applies the stored theme at activation and synchronizes matching storage events', () => {
    const target = new FakeThemeTarget();
    const root = createRoot();
    const onChange = vi.fn();
    const key = themePreferenceStorageKey('account')!;
    target.values.set(key, 'netflix');

    const stop = activateThemePreference('account', onChange, { target, root });
    expect(root.dataset.yeenTheme).toBe('netflix');
    expect(onChange).toHaveBeenLastCalledWith('netflix');

    target.dispatch(themePreferenceStorageKey('other'), 'obsidian-purple');
    expect(root.dataset.yeenTheme).toBe('netflix');

    target.dispatch(key, 'obsidian-purple');
    expect(root.dataset.yeenTheme).toBe('obsidian-purple');
    expect(onChange).toHaveBeenLastCalledWith('obsidian-purple');

    target.dispatch(key, 'not-a-theme');
    expect(root.dataset.yeenTheme).toBe('current');

    stop();
    target.dispatch(key, 'netflix');
    expect(root.dataset.yeenTheme).toBe('current');
  });

  it('applies the current theme explicitly when no DOM is supplied', () => {
    expect(applyThemePreference(undefined, undefined)).toBe('current');
  });
});
