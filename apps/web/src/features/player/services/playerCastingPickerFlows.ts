import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react';
import {
  ensureGoogleCastApiLoaded,
  getCastApis,
  inferCastContentType,
  isGoogleCastCancellation,
  isGoogleCastMissingOptionsError,
  isLoopbackStreamUrl,
  isPromptCancellation,
  toCastErrorMessage,
  type CastContext,
  type CastFrameworkApi,
  type ChromeCastApi,
  type OpenGoogleCastPickerResult,
  type VideoWithCastApis,
  type WindowWithGoogleCast,
} from './playerCastingSupport';

interface OpenGoogleCastPickerFlowOptions {
  sourceUrl: string | null;
  sourceIsHls: boolean;
  mediaTitle: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setGoogleCastSupported: Dispatch<SetStateAction<boolean>>;
  configureGoogleCastOptions: (
    castContext: CastContext,
    framework: CastFrameworkApi,
    chromeCast: ChromeCastApi,
  ) => boolean;
  googleCastOptionsConfiguredRef: MutableRefObject<boolean>;
}

export async function openGoogleCastPickerFlow({
  sourceUrl,
  sourceIsHls,
  mediaTitle,
  videoRef,
  setPlayerError,
  setGoogleCastSupported,
  configureGoogleCastOptions,
  googleCastOptionsConfiguredRef,
}: OpenGoogleCastPickerFlowOptions): Promise<OpenGoogleCastPickerResult> {
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
}

interface OpenCastPickerFlowOptions {
  sourceUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  remoteAvailable: boolean;
  googleCastSupported: boolean;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  openGoogleCastPicker: () => Promise<OpenGoogleCastPickerResult>;
}

export async function openCastPickerFlow({
  sourceUrl,
  videoRef,
  remoteAvailable,
  googleCastSupported,
  setPlayerError,
  openGoogleCastPicker,
}: OpenCastPickerFlowOptions): Promise<void> {
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
    setPlayerError(
      toCastErrorMessage(deferredPickerError, 'Unable to open the cast device picker.'),
    );
    return;
  }

  if (castInitializing) {
    setPlayerError('Cast services are initializing. Wait a moment and try again.');
    return;
  }

  setPlayerError('Casting is not supported in this browser.');
}
