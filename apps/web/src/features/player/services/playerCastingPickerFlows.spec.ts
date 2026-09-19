import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGoogleCastPickerFlow } from './playerCastingPickerFlows';
import type {
  CastContext,
  CastFrameworkApi,
  ChromeCastApi,
  WindowWithGoogleCast,
} from './playerCastingSupport';

describe('Google Cast media loading', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('loads an absolute receiver-reachable media URL when the player source is relative', async () => {
    let loadedContentId = '';
    const loadMedia = vi.fn(async () => undefined);
    const castContext: CastContext = {
      setOptions: vi.fn(),
      requestSession: vi.fn(async () => undefined),
      getCurrentSession: () => ({ loadMedia }),
    };
    const framework: CastFrameworkApi = {
      CastContext: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: 'receiver-id',
        getInstance: () => castContext,
      },
    };
    const chromeCast: ChromeCastApi = {
      media: {
        MediaInfo: class {
          constructor(contentId: string, contentType: string) {
            void contentType;
            loadedContentId = contentId;
          }
        },
        GenericMediaMetadata: class {},
        LoadRequest: class {},
      },
    };
    const castWindow = {
      isSecureContext: true,
      location: {
        href: 'https://yeen.home/player/media-1',
        origin: 'https://yeen.home',
      },
      cast: { framework },
      chrome: { cast: chromeCast },
    } as unknown as WindowWithGoogleCast;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: castWindow,
    });

    const setPlayerError = vi.fn();
    const result = await openGoogleCastPickerFlow({
      sourceUrl: '/api/stream/media-1/direct?access_token=signed-token',
      sourceIsHls: false,
      mediaTitle: 'Movie',
      videoRef: { current: { currentTime: 18, paused: false } } as never,
      setPlayerError,
      setGoogleCastSupported: vi.fn(),
      configureGoogleCastOptions: () => true,
      googleCastOptionsConfiguredRef: { current: true },
    });

    expect(result).toBe('handled');
    expect(loadMedia).toHaveBeenCalledOnce();
    expect(loadedContentId).toBe(
      'https://yeen.home/api/stream/media-1/direct?access_token=signed-token',
    );
    expect(setPlayerError).toHaveBeenLastCalledWith(null);
  });
});
