import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type Hls from 'hls.js';

interface UsePublicBroadcastStartPlaybackOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<Hls | null>;
  runPlaybackSyncRef: RefObject<() => void>;
  isLiveState: boolean;
  playbackIsPlaying: boolean;
  isTvExperience: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}

interface UsePublicBroadcastStartPlaybackResult {
  showStartPlaybackButton: boolean;
  startPlaybackButtonRef: RefObject<HTMLButtonElement | null>;
  handleStartPlaybackClick: () => void;
}

export function usePublicBroadcastStartPlayback({
  videoRef,
  hlsRef,
  runPlaybackSyncRef,
  isLiveState,
  playbackIsPlaying,
  isTvExperience,
  setError,
}: UsePublicBroadcastStartPlaybackOptions): UsePublicBroadcastStartPlaybackResult {
  const [showStartPlaybackButton, setShowStartPlaybackButton] = useState(false);
  const startPlaybackButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleStartPlaybackClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setShowStartPlaybackButton(false);

    const activeHls = hlsRef.current;
    if (activeHls) {
      try {
        activeHls.startLoad();
      } catch {
        // Ignore and rely on direct play attempt.
      }
    }

    void video.play()
      .then(() => {
        setError(null);
        runPlaybackSyncRef.current();
      })
      .catch(() => {
        setShowStartPlaybackButton(true);
      });
  }, [hlsRef, runPlaybackSyncRef, setError, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      setShowStartPlaybackButton(false);
      return;
    }

    const shouldOfferManualStart = Boolean(
      isLiveState && playbackIsPlaying,
    );

    const syncStartButtonVisibility = () => {
      setShowStartPlaybackButton(shouldOfferManualStart && video.paused);
    };

    syncStartButtonVisibility();

    video.addEventListener('play', syncStartButtonVisibility);
    video.addEventListener('playing', syncStartButtonVisibility);
    video.addEventListener('pause', syncStartButtonVisibility);
    video.addEventListener('loadedmetadata', syncStartButtonVisibility);
    video.addEventListener('loadeddata', syncStartButtonVisibility);
    video.addEventListener('canplay', syncStartButtonVisibility);

    return () => {
      video.removeEventListener('play', syncStartButtonVisibility);
      video.removeEventListener('playing', syncStartButtonVisibility);
      video.removeEventListener('pause', syncStartButtonVisibility);
      video.removeEventListener('loadedmetadata', syncStartButtonVisibility);
      video.removeEventListener('loadeddata', syncStartButtonVisibility);
      video.removeEventListener('canplay', syncStartButtonVisibility);
    };
  }, [isLiveState, playbackIsPlaying, videoRef]);

  useEffect(() => {
    if (!isTvExperience || !showStartPlaybackButton) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      startPlaybackButtonRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isTvExperience, showStartPlaybackButton]);

  return {
    showStartPlaybackButton,
    startPlaybackButtonRef,
    handleStartPlaybackClick,
  };
}
