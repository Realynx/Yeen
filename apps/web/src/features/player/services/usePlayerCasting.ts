import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

const GOOGLE_CAST_SCRIPT_ID = 'yeen-google-cast-sender';
const GOOGLE_CAST_SCRIPT_URL =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const GOOGLE_CAST_LOAD_TIMEOUT_MS = 7_000;
const DEFAULT_CAST_RECEIVER_APP_ID = 'CC1AD845';
const DEFAULT_CAST_AUTO_JOIN_POLICY = 'origin_scoped';

let googleCastApiLoadPromise: Promise<boolean> | null = null;

type RemotePlaybackConnectionState = 'connecting' | 'connected' | 'disconnected';

interface UsePlayerCastingOptions {
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

type OpenGoogleCastPickerResult = 'handled' | 'initializing' | 'unsupported';

interface VideoWithCastApis extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

interface WebKitPlaybackTargetAvailabilityEvent extends Event {
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

interface CastContext {
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

interface CastFrameworkApi {
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

interface ChromeCastApi {
  AutoJoinPolicy?: {
    ORIGIN_SCOPED?: string;
  };
  media: ChromeCastMediaApi;
}

interface WindowWithGoogleCast extends Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  cast?: {
    framework?: CastFrameworkApi;
  };
  chrome?: {
    cast?: ChromeCastApi;
  };
}

function normalizeRemoteState(
  state: string | undefined,
): RemotePlaybackConnectionState {
  if (state === 'connecting' || state === 'connected') {
    return state;
  }

  return 'disconnected';
}

function isPromptCancellation(error: unknown): boolean {
  return error instanceof DOMException
    && error.name === 'AbortError';
}

function toCastErrorMessage(error: unknown, fallback: string): string {
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

function getCastApis(
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

function inferCastContentType(sourceUrl: string, sourceIsHls: boolean): string {
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

function isGoogleCastCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string };
  const normalizedCode = maybeError.code?.toLowerCase();
  return normalizedCode === 'cancel';
}

function isGoogleCastMissingOptionsError(error: unknown): boolean {
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

function isLoopbackStreamUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl, window.location.href);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function ensureGoogleCastApiLoaded(): Promise<boolean> {
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

export function usePlayerCasting({
  videoRef,
  sourceUrl,
  sourceIsHls,
  mediaTitle,
  setPlayerError,
}: UsePlayerCastingOptions): PlayerCastingState {
  const [remoteSupported, setRemoteSupported] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [remoteState, setRemoteState] = useState<RemotePlaybackConnectionState>('disconnected');
  const [airPlaySupported, setAirPlaySupported] = useState(false);
  const [airPlayAvailable, setAirPlayAvailable] = useState(false);
  const [airPlayConnected, setAirPlayConnected] = useState(false);
  const [googleCastSupported, setGoogleCastSupported] = useState(false);
  const [googleCastConnected, setGoogleCastConnected] = useState(false);
  const googleCastOptionsConfiguredRef = useRef(false);

  const configureGoogleCastOptions = useCallback(
    (
      castContext: CastContext,
      framework: CastFrameworkApi,
      chromeCast: ChromeCastApi,
    ): boolean => {
      if (googleCastOptionsConfiguredRef.current) {
        return true;
      }

      const receiverApplicationId =
        framework.CastContext.DEFAULT_MEDIA_RECEIVER_APP_ID?.trim()
        || DEFAULT_CAST_RECEIVER_APP_ID;
      const autoJoinPolicy =
        chromeCast.AutoJoinPolicy?.ORIGIN_SCOPED ?? DEFAULT_CAST_AUTO_JOIN_POLICY;

      try {
        castContext.setOptions({
          receiverApplicationId,
          autoJoinPolicy,
        });
        googleCastOptionsConfiguredRef.current = true;
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message.trim().toLowerCase() : '';
        if (message.includes('already') && message.includes('option')) {
          googleCastOptionsConfiguredRef.current = true;
          return true;
        }

        setPlayerError(toCastErrorMessage(error, 'Unable to configure Google Cast.'));
        return false;
      }
    },
    [setPlayerError],
  );

  useEffect(() => {
    const video = videoRef.current as VideoWithCastApis | null;
    if (!video || !sourceUrl) {
      setRemoteSupported(false);
      setRemoteAvailable(false);
      setRemoteState('disconnected');
      setAirPlaySupported(false);
      setAirPlayAvailable(false);
      setAirPlayConnected(false);
      return;
    }

    let cancelled = false;
    let remoteWatchId: number | null = null;

    const remote = video.remote;
    const hasRemotePicker = Boolean(remote && typeof remote.prompt === 'function');

    setRemoteSupported(hasRemotePicker);
    setRemoteAvailable(false);
    setRemoteState(hasRemotePicker ? normalizeRemoteState(remote?.state) : 'disconnected');

    const syncRemoteState = () => {
      if (cancelled || !remote) {
        return;
      }

      setRemoteState(normalizeRemoteState(remote.state));
    };

    if (hasRemotePicker && remote) {
      remote.addEventListener('connecting', syncRemoteState);
      remote.addEventListener('connect', syncRemoteState);
      remote.addEventListener('disconnect', syncRemoteState);

      if (typeof remote.watchAvailability === 'function') {
        void remote
          .watchAvailability((available) => {
            if (!cancelled) {
              setRemoteAvailable(Boolean(available));
            }
          })
          .then((watchId) => {
            remoteWatchId = watchId;
          })
          .catch(() => {
            if (!cancelled) {
              // Some browsers expose prompt support but not availability events.
              setRemoteAvailable(true);
            }
          });
      } else {
        setRemoteAvailable(true);
      }
    }

    const hasAirPlayPicker = typeof video.webkitShowPlaybackTargetPicker === 'function';
    setAirPlaySupported(hasAirPlayPicker);
    setAirPlayAvailable(false);
    setAirPlayConnected(Boolean(video.webkitCurrentPlaybackTargetIsWireless));

    const handleAirPlayAvailability = (event: Event) => {
      if (cancelled) {
        return;
      }

      const availabilityEvent = event as WebKitPlaybackTargetAvailabilityEvent;
      setAirPlayAvailable(availabilityEvent.availability === 'available');
    };

    const handleAirPlayConnection = () => {
      if (cancelled) {
        return;
      }

      setAirPlayConnected(Boolean(video.webkitCurrentPlaybackTargetIsWireless));
    };

    if (hasAirPlayPicker) {
      video.setAttribute('x-webkit-airplay', 'allow');
      video.addEventListener(
        'webkitplaybacktargetavailabilitychanged',
        handleAirPlayAvailability as EventListener,
      );
      video.addEventListener(
        'webkitcurrentplaybacktargetiswirelesschanged',
        handleAirPlayConnection,
      );
      handleAirPlayConnection();
    }

    return () => {
      cancelled = true;

      if (hasRemotePicker && remote) {
        remote.removeEventListener('connecting', syncRemoteState);
        remote.removeEventListener('connect', syncRemoteState);
        remote.removeEventListener('disconnect', syncRemoteState);

        if (typeof remote.cancelWatchAvailability === 'function') {
          void remote.cancelWatchAvailability(remoteWatchId ?? undefined).catch(() => {
            // Ignore teardown failures from browser-specific implementations.
          });
        }
      }

      if (hasAirPlayPicker) {
        video.removeEventListener(
          'webkitplaybacktargetavailabilitychanged',
          handleAirPlayAvailability as EventListener,
        );
        video.removeEventListener(
          'webkitcurrentplaybacktargetiswirelesschanged',
          handleAirPlayConnection,
        );
      }
    };
  }, [sourceUrl, videoRef]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!window.isSecureContext) {
      setGoogleCastSupported(false);
      setGoogleCastConnected(false);
      googleCastOptionsConfiguredRef.current = false;
      return;
    }

    let cancelled = false;
    let detachStateListener: (() => void) | null = null;

    const configureGoogleCast = async () => {
      const loaded = await ensureGoogleCastApiLoaded();
      if (!loaded || cancelled) {
        if (!cancelled) {
          setGoogleCastSupported(false);
          setGoogleCastConnected(false);
        }
        return;
      }

      const castWindow = window as WindowWithGoogleCast;
      const castApis = getCastApis(castWindow);
      if (!castApis) {
        setGoogleCastSupported(false);
        setGoogleCastConnected(false);
        return;
      }

      const { framework, chromeCast } = castApis;
      const castContext = framework.CastContext.getInstance();

      if (!configureGoogleCastOptions(castContext, framework, chromeCast)) {
        setGoogleCastSupported(false);
        setGoogleCastConnected(false);
        return;
      }

      const syncCastState = () => {
        if (cancelled) {
          return;
        }

        const stateValue = castContext.getCastState?.() ?? '';
        const normalized = stateValue.toUpperCase();
        setGoogleCastConnected(normalized === 'CONNECTED' || normalized === 'CONNECTING');
      };

      syncCastState();

      const stateChangedEvent =
        framework.CastContextEventType?.CAST_STATE_CHANGED ?? 'caststatechanged';
      castContext.addEventListener?.(stateChangedEvent, syncCastState);
      detachStateListener = () => {
        castContext.removeEventListener?.(stateChangedEvent, syncCastState);
      };

      setGoogleCastSupported(true);
    };

    void configureGoogleCast();

    return () => {
      cancelled = true;
      detachStateListener?.();
    };
  }, [configureGoogleCastOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openGoogleCastPicker = useCallback(async (): Promise<OpenGoogleCastPickerResult> => {
    if (!sourceUrl || !window.isSecureContext) {
      return 'unsupported';
    }

    const castWindow = window as WindowWithGoogleCast;
    const castApis = getCastApis(castWindow);

    if (!castApis) {
      void ensureGoogleCastApiLoaded().then((loaded) => {
        if (loaded) {
          setGoogleCastSupported(true);
        }
      });
      return 'initializing';
    }

    const { framework, chromeCast } = castApis;
    const castContext = framework.CastContext.getInstance();

    if (!configureGoogleCastOptions(castContext, framework, chromeCast)) {
      return 'handled';
    }

    const requestSession = async () => {
      await castContext.requestSession();
    };

    let sessionStartError: unknown = null;

    try {
      await requestSession();
    } catch (error) {
      sessionStartError = error;
    }

    if (sessionStartError && isGoogleCastMissingOptionsError(sessionStartError)) {
      googleCastOptionsConfiguredRef.current = false;
      if (configureGoogleCastOptions(castContext, framework, chromeCast)) {
        try {
          await requestSession();
          sessionStartError = null;
        } catch (retryError) {
          sessionStartError = retryError;
        }
      }
    }

    if (sessionStartError) {
      const error = sessionStartError;

      if (isPromptCancellation(error) || isGoogleCastCancellation(error)) {
        return 'handled';
      }

      setPlayerError(toCastErrorMessage(error, 'Unable to open the cast device picker.'));
      return 'handled';
    }

    const session = castContext.getCurrentSession();
    if (!session) {
      setPlayerError('No cast session was started.');
      return 'handled';
    }

    try {
      const mediaInfo = new chromeCast.media.MediaInfo(
        sourceUrl,
        inferCastContentType(sourceUrl, sourceIsHls),
      );
      if (chromeCast.media.StreamType?.BUFFERED) {
        mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
      }

      if (mediaTitle?.trim()) {
        const metadata = new chromeCast.media.GenericMediaMetadata();
        metadata.title = mediaTitle.trim();
        mediaInfo.metadata = metadata;
      }

      const loadRequest = new chromeCast.media.LoadRequest(mediaInfo);
      const video = videoRef.current;
      const currentTime = video?.currentTime ?? 0;
      if (Number.isFinite(currentTime) && currentTime > 0) {
        loadRequest.currentTime = currentTime;
      }
      loadRequest.autoplay = !(video?.paused ?? false);

      await session.loadMedia(loadRequest);
      setPlayerError(null);
      return 'handled';
    } catch (error) {
      if (isPromptCancellation(error) || isGoogleCastCancellation(error)) {
        return 'handled';
      }

      const fallbackMessage = isLoopbackStreamUrl(sourceUrl)
        ? 'Cast device cannot reach localhost stream URLs. Use a LAN URL for VITE_API_BASE_URL and try again.'
        : 'Unable to load media on the selected cast device.';
      setPlayerError(toCastErrorMessage(error, fallbackMessage));
      return 'handled';
    }
  }, [
    configureGoogleCastOptions,
    mediaTitle,
    setGoogleCastSupported,
    setPlayerError,
    sourceIsHls,
    sourceUrl,
    videoRef,
  ]);

  const openCastPicker = useCallback(async () => {
    if (!window.isSecureContext) {
      setPlayerError('Casting requires HTTPS (or localhost) in this browser.');
      return;
    }

    const video = videoRef.current as VideoWithCastApis | null;
    if (!video || !sourceUrl) {
      setPlayerError('Stream is still preparing. Try casting again in a moment.');
      return;
    }

    const remote = video.remote;
    const canPromptRemote = Boolean(remote && typeof remote.prompt === 'function');
    const canPromptAirPlay = typeof video.webkitShowPlaybackTargetPicker === 'function';
    let deferredPickerError: unknown = null;
    let castInitializing = false;

    if (!canPromptAirPlay) {
      const googleCastResult = await openGoogleCastPicker();
      if (googleCastResult === 'handled') {
        return;
      }

      castInitializing = googleCastResult === 'initializing';
    }

    if (canPromptRemote && (remoteAvailable || !canPromptAirPlay)) {
      try {
        await remote.prompt();
        setPlayerError(null);
        return;
      } catch (error) {
        if (isPromptCancellation(error)) {
          return;
        }

        deferredPickerError = error;
      }
    }

    if (canPromptAirPlay) {
      try {
        video.webkitShowPlaybackTargetPicker?.();
        setPlayerError(null);
        return;
      } catch (error) {
        deferredPickerError = deferredPickerError ?? error;
      }
    }

    if (canPromptRemote) {
      try {
        await remote.prompt();
        setPlayerError(null);
        return;
      } catch (error) {
        if (isPromptCancellation(error)) {
          return;
        }

        deferredPickerError = error;
      }
    }

    if (googleCastSupported) {
      const googleCastResult = await openGoogleCastPicker();
      if (googleCastResult === 'handled') {
        return;
      }

      castInitializing = castInitializing || googleCastResult === 'initializing';
    }

    if (deferredPickerError) {
      setPlayerError(toCastErrorMessage(deferredPickerError, 'Unable to open the cast device picker.'));
      return;
    }

    if (castInitializing) {
      setPlayerError('Cast services are initializing. Wait a moment and try again.');
      return;
    }

    setPlayerError('Casting is not supported in this browser.');
  }, [
    googleCastSupported,
    openGoogleCastPicker,
    remoteAvailable,
    setPlayerError,
    sourceUrl,
    videoRef,
  ]);

  return {
    canCast:
      Boolean(sourceUrl)
      && (remoteSupported || airPlaySupported || googleCastSupported),
    castDeviceAvailable: remoteAvailable || airPlayAvailable || googleCastSupported,
    isCasting:
      remoteState !== 'disconnected' || airPlayConnected || googleCastConnected,
    openCastPicker,
  };
}