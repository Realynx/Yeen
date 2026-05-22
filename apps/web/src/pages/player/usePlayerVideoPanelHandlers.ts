import { useCallback, useEffect, useRef } from 'react';
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import type { PlaybackSource } from './usePlayerData';
import { clamp, describeMediaError } from './playerUtils';

interface UsePlayerVideoPanelHandlersOptions {
  mediaId: string;
  revealControls: () => void;
  seekTo: (seconds: number) => void;
  seekValue: number;
  setIsSeeking: Dispatch<SetStateAction<boolean>>;
  setSeekPreviewSeconds: Dispatch<SetStateAction<number | null>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setQualityMode: (value: 'auto' | number) => void;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsBuffering: Dispatch<SetStateAction<boolean>>;
  setIsControlsVisible: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  syncProgress: (completed?: boolean) => Promise<void>;
  switchingToHls: boolean;
  source: PlaybackSource | null;
  attemptedHlsFallbackRef: MutableRefObject<boolean>;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
  }) => Promise<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

interface PlayerVideoPanelHandlers {
  hideControls: () => void;
  clearSeekPreview: () => void;
  handleSeekTouchEnd: () => void;
  handlePlaybackRateChange: (nextRate: number) => void;
  handleQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  handleToggleTheaterMode: () => void;
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoEnded: () => void;
  handleVideoWaiting: () => void;
  handleVideoReady: () => void;
  handleVideoError: () => void;
}

export function usePlayerVideoPanelHandlers({
  mediaId,
  revealControls,
  seekTo,
  seekValue,
  setIsSeeking,
  setSeekPreviewSeconds,
  setPlaybackRate,
  setQualityMode,
  setTheaterMode,
  setIsPlaying,
  setIsBuffering,
  setIsControlsVisible,
  setPlayerError,
  syncProgress,
  switchingToHls,
  source,
  attemptedHlsFallbackRef,
  switchToHls,
  videoRef,
}: UsePlayerVideoPanelHandlersOptions): PlayerVideoPanelHandlers {
  const attemptedHlsRestartRef = useRef(false);

  useEffect(() => {
    attemptedHlsRestartRef.current = false;
  }, [mediaId]);

  const hideControls = useCallback(() => {
    setIsControlsVisible(false);
  }, [setIsControlsVisible]);

  const clearSeekPreview = useCallback(() => {
    setSeekPreviewSeconds(null);
  }, [setSeekPreviewSeconds]);

  const handleSeekTouchEnd = useCallback(() => {
    setIsSeeking(false);
    seekTo(seekValue);
  }, [seekTo, seekValue, setIsSeeking]);

  const handlePlaybackRateChange = useCallback(
    (nextRate: number) => {
      setPlaybackRate(clamp(nextRate, 0.5, 2));
      revealControls();
    },
    [revealControls, setPlaybackRate],
  );

  const handleQualityModeChange = useCallback(
    (nextQualityMode: 'auto' | number) => {
      setQualityMode(nextQualityMode);
      revealControls();
    },
    [revealControls, setQualityMode],
  );

  const handleToggleTheaterMode = useCallback(() => {
    setTheaterMode((previous) => !previous);
    revealControls();
  }, [revealControls, setTheaterMode]);

  const handleVideoPlay = useCallback(() => {
    setIsPlaying(true);
    setIsBuffering(false);
    revealControls();
  }, [revealControls, setIsBuffering, setIsPlaying]);

  const handleVideoPause = useCallback(() => {
    setIsPlaying(false);
    setIsBuffering(false);
    revealControls();
    void syncProgress(false);
  }, [revealControls, setIsBuffering, setIsPlaying, syncProgress]);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    setIsControlsVisible(true);
    void syncProgress(true);
  }, [setIsControlsVisible, setIsPlaying, syncProgress]);

  const handleVideoWaiting = useCallback(() => {
    setIsBuffering(true);
  }, [setIsBuffering]);

  const handleVideoReady = useCallback(() => {
    setIsBuffering(false);
    setPlayerError(null);
  }, [setIsBuffering, setPlayerError]);

  const handleVideoError = useCallback(() => {
    const mediaErrorCode = videoRef.current?.error?.code;
    const mediaErrorText = describeMediaError(mediaErrorCode);

    if (switchingToHls) {
      setPlayerError(
        source?.hls
          ? 'Transcoded playback failed. Restarting stream session...'
          : 'Direct play failed. Starting transcoded stream...',
      );
      return;
    }

    if (source && !source.hls && !attemptedHlsFallbackRef.current) {
      attemptedHlsFallbackRef.current = true;
      setPlayerError(`Direct play failed (${mediaErrorText}). Switching to transcoded stream...`);

      void switchToHls().then((switched) => {
        if (!switched) {
          setPlayerError(
            `Direct play failed (${mediaErrorText}) and transcoded fallback could not start.`,
          );
        }
      });
      return;
    }

    if (source?.hls && !attemptedHlsRestartRef.current) {
      attemptedHlsRestartRef.current = true;
      setPlayerError(
        `Transcoded playback failed (${mediaErrorText}). Restarting stream session...`,
      );

      void switchToHls({ forceFresh: true }).then((switched) => {
        if (!switched) {
          setPlayerError(
            `Transcoded playback failed (${mediaErrorText}) and session restart could not start.`,
          );
        }
      });
      return;
    }

    setPlayerError(
      `Playback failed (${mediaErrorText}). Try another quality setting or reload the page.`,
    );
  }, [
    attemptedHlsFallbackRef,
    source,
    switchToHls,
    switchingToHls,
    videoRef,
    setPlayerError,
  ]);

  return {
    hideControls,
    clearSeekPreview,
    handleSeekTouchEnd,
    handlePlaybackRateChange,
    handleQualityModeChange,
    handleToggleTheaterMode,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnded,
    handleVideoWaiting,
    handleVideoReady,
    handleVideoError,
  };
}
