import { useCallback, useEffect } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import { clamp } from './playerUtils';

const PLAYER_SCRUBBING_CLASS = 'is-player-scrubbing';

function clearDocumentSelection(): void {
  try {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  } catch {
    // Ignore selection API edge cases.
  }
}

interface UsePlayerTimelineHandlersOptions {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  totalDuration: number;
  requestedStartSeconds: number;
  resumeAtSeconds: number;
  isSeeking: boolean;
  hasAppliedInitialSeekRef: MutableRefObject<boolean>;
  setCurrentTime: (seconds: number) => void;
  setSeekValue: (seconds: number) => void;
  setBufferedPercent: (percent: number) => void;
  setDuration: (seconds: number) => void;
  setIsBuffering: (value: boolean) => void;
  setIsSeeking: (value: boolean) => void;
  setSeekPreviewSeconds: (seconds: number | null) => void;
  seekTo: (seconds: number) => void;
  revealControls: () => void;
  syncProgress: (completed?: boolean, keepalive?: boolean) => Promise<void>;
}

interface PlayerTimelineHandlers {
  handleTimeUpdate: () => void;
  handleBufferedProgress: () => void;
  handleDurationChange: () => void;
  handleLoadedMetadata: () => void;
  handleSeekInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSeekPointerDown: () => void;
  handleSeekPointerUp: (event: ReactMouseEvent<HTMLInputElement>) => void;
  handleSeekPreview: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function usePlayerTimelineHandlers({
  videoRef,
  totalDuration,
  requestedStartSeconds,
  resumeAtSeconds,
  isSeeking,
  hasAppliedInitialSeekRef,
  setCurrentTime,
  setSeekValue,
  setBufferedPercent,
  setDuration,
  setIsBuffering,
  setIsSeeking,
  setSeekPreviewSeconds,
  seekTo,
  revealControls,
  syncProgress,
}: UsePlayerTimelineHandlersOptions): PlayerTimelineHandlers {
  useEffect(() => {
    return () => {
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
    };
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!isSeeking) {
      setCurrentTime(video.currentTime || 0);
    }
  }, [isSeeking, setCurrentTime, videoRef]);

  const handleBufferedProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const maxDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
    if (maxDuration <= 0 || video.buffered.length === 0) {
      setBufferedPercent(0);
      return;
    }

    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    setBufferedPercent(clamp((bufferedEnd / maxDuration) * 100, 0, 100));
  }, [setBufferedPercent, totalDuration, videoRef]);

  const handleDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }
  }, [setDuration, videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const maxDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }

    if (!hasAppliedInitialSeekRef.current) {
      const preferredStart = requestedStartSeconds > 0 ? requestedStartSeconds : resumeAtSeconds;
      const seekUpperBound = Math.max(maxDuration - 5, 0);
      const target = clamp(preferredStart, 0, seekUpperBound);

      if (target > 0) {
        video.currentTime = target;
      }

      hasAppliedInitialSeekRef.current = true;
      setCurrentTime(video.currentTime || 0);
      setSeekValue(video.currentTime || 0);
    }

    setIsBuffering(false);
  }, [
    hasAppliedInitialSeekRef,
    requestedStartSeconds,
    resumeAtSeconds,
    setCurrentTime,
    setDuration,
    setIsBuffering,
    setSeekValue,
    totalDuration,
    videoRef,
  ]);

  const handleSeekInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(event.target.value);
      const nextValue = Number.isFinite(parsed) ? clamp(parsed, 0, totalDuration) : 0;

      setSeekValue(nextValue);
      setCurrentTime(nextValue);

      if (!isSeeking) {
        seekTo(nextValue);
      }
    },
    [isSeeking, seekTo, setCurrentTime, setSeekValue, totalDuration],
  );

  const handleSeekPointerDown = useCallback(() => {
    document.body.classList.add(PLAYER_SCRUBBING_CLASS);
    clearDocumentSelection();

    setIsSeeking(true);
    revealControls();
  }, [revealControls, setIsSeeking]);

  const handleSeekPointerUp = useCallback(
    (event: ReactMouseEvent<HTMLInputElement>) => {
      event.preventDefault();
      const parsed = Number(event.currentTarget.value);
      const nextValue = Number.isFinite(parsed) ? clamp(parsed, 0, totalDuration) : 0;
      setIsSeeking(false);
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
      clearDocumentSelection();
      seekTo(nextValue);
      void syncProgress(false);
    },
    [seekTo, setIsSeeking, syncProgress, totalDuration],
  );

  const handleSeekPreview = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (totalDuration <= 0) {
        setSeekPreviewSeconds(null);
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.width <= 0) {
        setSeekPreviewSeconds(null);
        return;
      }

      const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      setSeekPreviewSeconds(ratio * totalDuration);
    },
    [setSeekPreviewSeconds, totalDuration],
  );

  return {
    handleTimeUpdate,
    handleBufferedProgress,
    handleDurationChange,
    handleLoadedMetadata,
    handleSeekInputChange,
    handleSeekPointerDown,
    handleSeekPointerUp,
    handleSeekPreview,
  };
}
