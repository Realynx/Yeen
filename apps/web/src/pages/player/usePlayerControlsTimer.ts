import { useCallback, useRef } from 'react';

export interface PlayerControlsTimer {
  clearControlsTimer: () => void;
  scheduleControlsAutoHide: () => void;
  revealControls: () => void;
}

interface UsePlayerControlsTimerArgs {
  isPlaying: boolean;
  isSeeking: boolean;
  setIsControlsVisible: (visible: boolean) => void;
}

const HIDE_DELAY_MS = 2200;

export function usePlayerControlsTimer({
  isPlaying,
  isSeeking,
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

    hideControlsTimerRef.current = window.setTimeout(() => {
      setIsControlsVisible(false);
    }, HIDE_DELAY_MS);
  }, [clearControlsTimer, isPlaying, isSeeking, setIsControlsVisible]);

  const revealControls = useCallback(() => {
    setIsControlsVisible(true);
    scheduleControlsAutoHide();
  }, [scheduleControlsAutoHide, setIsControlsVisible]);

  return { clearControlsTimer, scheduleControlsAutoHide, revealControls };
}
