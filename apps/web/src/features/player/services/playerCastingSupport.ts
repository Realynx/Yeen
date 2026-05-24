import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';

const GOOGLE_CAST_SCRIPT_ID = 'yeen-google-cast-sender';
const GOOGLE_CAST_SCRIPT_URL =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const GOOGLE_CAST_LOAD_TIMEOUT_MS = 7_000;
export const DEFAULT_CAST_RECEIVER_APP_ID = 'CC1AD845';
export const DEFAULT_CAST_AUTO_JOIN_POLICY = 'origin_scoped';

let googleCastApiLoadPromise: Promise<boolean> | null = null;

export type RemotePlaybackConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected';

export interface UsePlayerCastingOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  sourceUrl: string | null;
  sourceIsHls: boolean;
  mediaTitle: string | null;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
}

export interface PlayerCastingState {
  canCast: boolean;
  castDeviceAvailable: boolean;
  isCasting: boolean;
  openCastPicker: () => Promise<void>;
}

export type OpenGoogleCastPickerResult =
  | 'handled'
  | 'initializing'
  | 'unsupported';

export interface VideoWithCastApis extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

export interface WebKitPlaybackTargetAvailabilityEvent extends Event {
  availability?: string;
}

interface CastMediaMetadata {
  title?: string;
}

interface CastMediaInfo {
  metadata?: CastMediaMetadata;
  streamType?: string;
}

interface CastLoadRequest {
  autoplay?: boolean;
  currentTime?: number;
}

interface CastSession {
  loadMedia: (request: CastLoadRequest) => Promise<void>;
}

export interface CastContext {
  setOptions: (options: {
    receiverApplicationId: string;
    autoJoinPolicy: string;
  }) => void;
  requestSession: () => Promise<void>;
  getCurrentSession: () => CastSession | null;
  getCastState?: () => string;
  addEventListener?: (eventType: string, listener: () => void) => void;
  removeEventListener?: (eventType: string, listener: () => void) => void;
}

export interface CastFrameworkApi {
  CastContext: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    getInstance: () => CastContext;
  };
  CastContextEventType?: {
    CAST_STATE_CHANGED?: string;
  };
}

interface ChromeCastMediaApi {
  MediaInfo: new (contentId: string, contentType: string) => CastMediaInfo;
  GenericMediaMetadata: new () => CastMediaMetadata;
  LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
  StreamType?: {
    BUFFERED?: string;
  };
}

export interface ChromeCastApi {
  AutoJoinPolicy?: {
    ORIGIN_SCOPED?: string;
  };
  media: ChromeCastMediaApi;
}

export interface WindowWithGoogleCast extends Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  cast?: {
    framework?: CastFrameworkApi;
  };
  chrome?: {
    cast?: ChromeCastApi;
  };
}

export function normalizeRemoteState(
  state: string | undefined,
): RemotePlaybackConnectionState {
  if (state === 'connecting' || state === 'connected') {
    return state;
  }

  return 'disconnected';
}

export function isPromptCancellation(error: unknown): boolean {
  return error instanceof DOMException
    && error.name === 'AbortError';
}

export function toCastErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return 'No castable devices were found on your network.';
    }

    if (error.name === 'InvalidStateError') {
      return 'The stream is not ready for casting yet. Try again in a moment.';
    }

    if (error.name === 'NotAllowedError') {
      return 'The browser blocked the cast picker. Click the player once, then try cast again.';
    }

    if (error.name === 'NotSupportedError') {
      return 'This browser cannot open a cast picker for this stream format.';
    }

    if (error.name === 'SecurityError') {
      return 'Casting requires a secure browsing context (HTTPS or localhost).';
    }

    const domMessage = error.message?.trim();
    if (domMessage) {
      return `${fallback} (${error.name}: ${domMessage})`;
    }

    if (error.name?.trim()) {
      return `${fallback} (${error.name})`;
    }
  }

  if (error && typeof error === 'object') {
    const maybeError = error as { code?: string | number };
    const code = String(maybeError.code ?? '').toLowerCase();

    if (code === 'receiver_unavailable') {
      return 'No castable devices were found on your network.';
    }

    if (code === 'api_not_initialized') {
      return 'Cast services are still initializing. Wait a moment and try again.';
    }

    if (code === 'timeout') {
      return 'Timed out while contacting cast devices. Try again.';
    }

    if (code === 'extension_missing') {
      return 'Google Cast sender components are unavailable in this browser profile.';
    }

    if (code === 'channel_error') {
      return 'Could not connect to the selected cast device. Try again.';
    }

    if (code === 'session_error') {
      return 'Cast session could not be started. Try again.';
    }

    if (code === 'invalid_parameter') {
      return 'The cast request was rejected by the browser. Reload and try again.';
    }

    const message = (maybeError as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return `${fallback} (${message.trim()})`;
    }
  }

  return fallback;
}

export function getCastApis(
  castWindow: WindowWithGoogleCast,
): { framework: CastFrameworkApi; chromeCast: ChromeCastApi } | null {
  const framework = castWindow.cast?.framework;
  const chromeCast = castWindow.chrome?.cast;

  if (!framework || !chromeCast) {
    return null;
  }

  return {
    framework,
    chromeCast,
  };
}

export function inferCastContentType(sourceUrl: string, sourceIsHls: boolean): string {
  if (sourceIsHls) {
    return 'application/x-mpegURL';
  }

  try {
    const parsed = new URL(sourceUrl, window.location.href);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.m3u8')) {
      return 'application/x-mpegURL';
    }
    if (pathname.endsWith('.mp4')) {
      return 'video/mp4';
    }
    if (pathname.endsWith('.webm')) {
      return 'video/webm';
    }
  } catch {
    // Fall through to default.
  }

  return 'video/mp4';
}

export function isGoogleCastCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string };
  const normalizedCode = maybeError.code?.toLowerCase();
  return normalizedCode === 'cancel';
}

export function isGoogleCastMissingOptionsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string | number; message?: unknown };
  const code = String(maybeError.code ?? '').toLowerCase();
  const message =
    typeof maybeError.message === 'string' ? maybeError.message.toLowerCase() : '';

  return code === 'api_not_initialized'
    || message.includes('before cast options are provided')
    || message.includes('cast options are provided');
}

export function isLoopbackStreamUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl, window.location.href);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function ensureGoogleCastApiLoaded(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return Promise.resolve(false);
  }

  const castWindow = window as WindowWithGoogleCast;
  if (getCastApis(castWindow)) {
    return Promise.resolve(true);
  }

  if (googleCastApiLoadPromise) {
    return googleCastApiLoadPromise;
  }

  googleCastApiLoadPromise = new Promise<boolean>((resolve) => {
    const previousCallback = castWindow.__onGCastApiAvailable;
    let settled = false;
    let timeoutId = 0;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      castWindow.__onGCastApiAvailable = previousCallback;
      resolve(value);
    };

    castWindow.__onGCastApiAvailable = (isAvailable: boolean) => {
      previousCallback?.(isAvailable);
      finish(Boolean(isAvailable && getCastApis(castWindow)));
    };

    const existingScript = document.getElementById(GOOGLE_CAST_SCRIPT_ID);
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = GOOGLE_CAST_SCRIPT_ID;
      script.src = GOOGLE_CAST_SCRIPT_URL;
      script.async = true;
      script.addEventListener('error', () => finish(false), { once: true });
      document.head.appendChild(script);
    }

    timeoutId = window.setTimeout(() => {
      finish(Boolean(getCastApis(castWindow)));
    }, GOOGLE_CAST_LOAD_TIMEOUT_MS);
  });

  return googleCastApiLoadPromise;
}
