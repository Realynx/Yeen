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
  toAbsoluteCastMediaUrl,
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

async function requestCastSession(
  castContext: CastContext,
  framework: CastFrameworkApi,
  chromeCast: ChromeCastApi,
  configureOptions: OpenGoogleCastPickerFlowOptions['configureGoogleCastOptions'],
  configuredRef: MutableRefObject<boolean>,
): Promise<unknown> {
  try {
    await castContext.requestSession();
    return null;
  } catch (error) {
    if (!isGoogleCastMissingOptionsError(error)) return error;
  }
  configuredRef.current = false;
  if (!configureOptions(castContext, framework, chromeCast)) return new Error('Cast options unavailable.');
  try {
    await castContext.requestSession();
    return null;
  } catch (error) {
    return error;
  }
}

function createCastLoadRequest(
  chromeCast: ChromeCastApi,
  mediaUrl: string,
  sourceIsHls: boolean,
  mediaTitle: string | null,
  video: HTMLVideoElement | null,
) {
  const mediaInfo = new chromeCast.media.MediaInfo(mediaUrl, inferCastContentType(mediaUrl, sourceIsHls));
  if (chromeCast.media.StreamType?.BUFFERED) mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
  if (mediaTitle?.trim()) {
    const metadata = new chromeCast.media.GenericMediaMetadata();
    metadata.title = mediaTitle.trim();
    mediaInfo.metadata = metadata;
  }
  const request = new chromeCast.media.LoadRequest(mediaInfo);
  const currentTime = video?.currentTime ?? 0;
  if (Number.isFinite(currentTime) && currentTime > 0) request.currentTime = currentTime;
  request.autoplay = !(video?.paused ?? false);
  return request;
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

  const castMediaUrl = toAbsoluteCastMediaUrl(sourceUrl);
  if (isLoopbackStreamUrl(castMediaUrl)) {
    setPlayerError(
      'Cast devices cannot reach a localhost stream. Open Yeen using its LAN or HTTPS address, then try again.',
    );
    return 'handled';
  }

  if (!configureGoogleCastOptions(castContext, framework, chromeCast)) {
    return 'handled';
  }

  const sessionStartError = await requestCastSession(
    castContext, framework, chromeCast, configureGoogleCastOptions, googleCastOptionsConfiguredRef,
  );

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
    const loadRequest = createCastLoadRequest(
      chromeCast, castMediaUrl, sourceIsHls, mediaTitle, videoRef.current,
    );
    await session.loadMedia(loadRequest);
    setPlayerError(null);
    return 'handled';
  } catch (error) {
    if (isPromptCancellation(error) || isGoogleCastCancellation(error)) {
      return 'handled';
    }

    const fallbackMessage = isLoopbackStreamUrl(castMediaUrl)
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

interface NativePickerResult {
  handled: boolean;
  error: unknown;
}

async function promptRemote(remote: NonNullable<VideoWithCastApis['remote']>): Promise<NativePickerResult> {
  try {
    await remote.prompt();
    return { handled: true, error: null };
  } catch (error) {
    return { handled: isPromptCancellation(error), error };
  }
}

async function tryNativePickers(
  video: VideoWithCastApis,
  remoteAvailable: boolean,
): Promise<NativePickerResult> {
  const remote = video.remote;
  const canPromptRemote = Boolean(remote && typeof remote.prompt === 'function');
  const canPromptAirPlay = typeof video.webkitShowPlaybackTargetPicker === 'function';
  let deferredError: unknown = null;
  if (canPromptRemote && remote && (remoteAvailable || !canPromptAirPlay)) {
    const result = await promptRemote(remote);
    if (result.handled) return result;
    deferredError = result.error;
  }
  if (canPromptAirPlay) {
    try {
      video.webkitShowPlaybackTargetPicker?.();
      return { handled: true, error: null };
    } catch (error) {
      deferredError ??= error;
    }
  }
  if (canPromptRemote && remote) {
    const result = await promptRemote(remote);
    if (result.handled) return result;
    deferredError = result.error;
  }
  return { handled: false, error: deferredError };
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

  const canPromptAirPlay = typeof video.webkitShowPlaybackTargetPicker === 'function';
  let castInitializing = false;

  if (!canPromptAirPlay) {
    const googleCastResult = await openGoogleCastPicker();
    if (googleCastResult === 'handled') {
      return;
    }

    castInitializing = googleCastResult === 'initializing';
  }

  const nativeResult = await tryNativePickers(video, remoteAvailable);
  if (nativeResult.handled) {
    if (!isPromptCancellation(nativeResult.error)) setPlayerError(null);
    return;
  }

  if (googleCastSupported) {
    const googleCastResult = await openGoogleCastPicker();
    if (googleCastResult === 'handled') {
      return;
    }

    castInitializing = castInitializing || googleCastResult === 'initializing';
  }

  if (nativeResult.error) {
    setPlayerError(
      toCastErrorMessage(nativeResult.error, 'Unable to open the cast device picker.'),
    );
    return;
  }

  if (castInitializing) {
    setPlayerError('Cast services are initializing. Wait a moment and try again.');
    return;
  }

  setPlayerError('Casting is not supported in this browser.');
}
