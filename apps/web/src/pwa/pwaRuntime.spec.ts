import { describe, expect, it, vi } from 'vitest';
import { registerYeenPwa, shouldRegisterYeenPwa } from './pwaRuntime';

describe('shouldRegisterYeenPwa', () => {
  it('registers only in a production browser with service worker support', () => {
    expect(
      shouldRegisterYeenPwa({
        isProduction: true,
        isNativePlatform: false,
        serviceWorkerSupported: true,
      }),
    ).toBe(true);
    expect(
      shouldRegisterYeenPwa({
        isProduction: false,
        isNativePlatform: false,
        serviceWorkerSupported: true,
      }),
    ).toBe(false);
    expect(
      shouldRegisterYeenPwa({
        isProduction: true,
        isNativePlatform: true,
        serviceWorkerSupported: true,
      }),
    ).toBe(false);
    expect(
      shouldRegisterYeenPwa({
        isProduction: true,
        isNativePlatform: false,
        serviceWorkerSupported: false,
      }),
    ).toBe(false);
  });
});

describe('registerYeenPwa', () => {
  it('does not touch service workers in a Capacitor build', () => {
    const registerServiceWorker = vi.fn();

    registerYeenPwa(
      registerServiceWorker,
      {
        isProduction: true,
        isNativePlatform: true,
        serviceWorkerSupported: true,
      },
      {} as Window,
    );

    expect(registerServiceWorker).not.toHaveBeenCalled();
  });

  it('registers immediately and cleans up browser lifecycle listeners', () => {
    const addWindowListener = vi.fn();
    const removeWindowListener = vi.fn();
    const addDocumentListener = vi.fn();
    const removeDocumentListener = vi.fn();
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const registerServiceWorker = vi.fn().mockReturnValue(updateServiceWorker);
    const target = {
      addEventListener: addWindowListener,
      removeEventListener: removeWindowListener,
      document: {
        visibilityState: 'visible',
        addEventListener: addDocumentListener,
        removeEventListener: removeDocumentListener,
      },
      navigator: {
        onLine: true,
      },
    } as unknown as Window;

    const cleanup = registerYeenPwa(
      registerServiceWorker,
      {
        isProduction: true,
        isNativePlatform: false,
        serviceWorkerSupported: true,
      },
      target,
    );

    expect(registerServiceWorker).toHaveBeenCalledWith(
      expect.objectContaining({ immediate: true }),
    );
    expect(addWindowListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addWindowListener).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(addDocumentListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    cleanup();

    expect(removeWindowListener).toHaveBeenCalledTimes(2);
    expect(removeDocumentListener).toHaveBeenCalledTimes(1);
  });
});
