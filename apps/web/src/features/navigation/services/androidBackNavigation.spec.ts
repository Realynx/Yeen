import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAndroidBackNavigation } from './androidBackNavigation';

describe('handleAndroidBackNavigation', () => {
  beforeEach(() => {
    vi.stubGlobal('KeyboardEvent', class extends Event {
      key: string;

      constructor(type: string, init?: KeyboardEventInit) {
        super(type);
        this.key = init?.key ?? '';
      }
    });
  });

  it('dismisses an open web layer before changing routes', () => {
    const back = vi.fn();
    const dispatchEvent = vi.fn();

    expect(handleAndroidBackNavigation(
      { location: { pathname: '/player/1', search: '', hash: '' }, history: { back } },
      {
        fullscreenElement: null,
        querySelector: () => ({}) as Element,
        dispatchEvent,
      },
    )).toBe(true);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
  });

  it('returns to the previous SPA route when no layer is open', () => {
    const back = vi.fn();

    expect(handleAndroidBackNavigation(
      { location: { pathname: '/library', search: '', hash: '' }, history: { back } },
      {
        fullscreenElement: null,
        querySelector: () => null,
        dispatchEvent: vi.fn(),
      },
    )).toBe(true);

    expect(back).toHaveBeenCalledOnce();
  });

  it('dismisses an active TV text field before closing the root activity', () => {
    const blur = vi.fn();

    expect(handleAndroidBackNavigation(
      { location: { pathname: '/', search: '', hash: '' }, history: { back: vi.fn() } },
      {
        activeElement: {
          matches: (selector: string) => selector.includes('input'),
          blur,
        },
        fullscreenElement: null,
        querySelector: () => null,
        dispatchEvent: vi.fn(),
      },
    )).toBe(true);

    expect(blur).toHaveBeenCalledOnce();
  });

  it('lets Android close the activity from the root route', () => {
    const querySelector = vi.fn(() => null);

    expect(handleAndroidBackNavigation(
      { location: { pathname: '/', search: '', hash: '' }, history: { back: vi.fn() } },
      {
        fullscreenElement: null,
        querySelector,
        dispatchEvent: vi.fn(),
      },
    )).toBe(false);

    expect(querySelector).toHaveBeenCalledWith(
      expect.not.stringContaining('.profile-menu,'),
    );
  });
});
