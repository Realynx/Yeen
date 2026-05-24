import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_CAST_AUTO_JOIN_POLICY,
  DEFAULT_CAST_RECEIVER_APP_ID,
  ensureGoogleCastApiLoaded,
  getCastApis,
  normalizeRemoteState,
  toCastErrorMessage,
  type CastContext,
  type CastFrameworkApi,
  type ChromeCastApi,
  type PlayerCastingState,
  type RemotePlaybackConnectionState,
  type UsePlayerCastingOptions,
  type VideoWithCastApis,
  type WebKitPlaybackTargetAvailabilityEvent,
  type WindowWithGoogleCast,
} from './playerCastingSupport';
import {
  openCastPickerFlow,
  openGoogleCastPickerFlow,
} from './playerCastingPickerFlows';
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

  const openGoogleCastPicker = useCallback(
    () =>
      openGoogleCastPickerFlow({
        sourceUrl,
        sourceIsHls,
        mediaTitle,
        videoRef,
        setPlayerError,
        setGoogleCastSupported,
        configureGoogleCastOptions,
        googleCastOptionsConfiguredRef,
      }),
    [
      configureGoogleCastOptions,
      mediaTitle,
      setGoogleCastSupported,
      setPlayerError,
      sourceIsHls,
      sourceUrl,
      videoRef,
    ],
  );

  const openCastPicker = useCallback(
    () =>
      openCastPickerFlow({
        sourceUrl,
        videoRef,
        remoteAvailable,
        googleCastSupported,
        setPlayerError,
        openGoogleCastPicker,
      }),
    [
      googleCastSupported,
      openGoogleCastPicker,
      remoteAvailable,
      setPlayerError,
      sourceUrl,
      videoRef,
    ],
  );

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
