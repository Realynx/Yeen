import { useCallback, useRef } from 'react';

export interface PlayerControlsTimer {
  clearControlsTimer: () => void;
  scheduleControlsAutoHide: () => void;
  revealControls: () => void;
}

interface UsePlayerControlsTimerArgs {
  isPlaying: boolean;
  isSeeking: boolean;
  isTvMode?: boolean;
  setIsControlsVisible: (visible: boolean) => void;
}

const HIDE_DELAY_MS = 2200;
const TV_HIDE_DELAY_MS = 3000;

export function usePlayerControlsTimer({
  isPlaying,
  isSeeking,
  isTvMode = false,
  setIsControlsVisible,
}: UsePlayerControlsTimerArgs): PlayerControlsTimer {
  const hideControlsTimerRef = useRef<number | null>(null);

  const clearControlsTimer = useCallback(() => {
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }, []);

  const scheduleControlsAutoHide = useCallback(() => {
    clearControlsTimer();

    if (!isPlaying || isSeeking) {
      return;
    }

    const hideDelayMs = isTvMode ? TV_HIDE_DELAY_MS : HIDE_DELAY_MS;

    hideControlsTimerRef.current = window.setTimeout(() => {
      setIsControlsVisible(false);
    }, hideDelayMs);
  }, [clearControlsTimer, isPlaying, isSeeking, isTvMode, setIsControlsVisible]);

  const revealControls = useCallback(() => {
    setIsControlsVisible(true);
    scheduleControlsAutoHide();
  }, [scheduleControlsAutoHide, setIsControlsVisible]);

  return { clearControlsTimer, scheduleControlsAutoHide, revealControls };
}
