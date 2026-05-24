import { useEffect } from 'react';

const PLAYER_SCRUBBING_CLASS = 'is-player-scrubbing';

export function usePlayerScrubbingClass(isSeeking: boolean) {
  useEffect(() => {
    if (!isSeeking) {
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
      return;
    }

    const preventSelection = (event: Event) => {
      event.preventDefault();
    };

    const clearSelection = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      } catch {
        // Ignore selection API edge cases during scrubbing.
      }
    };

    document.body.classList.add(PLAYER_SCRUBBING_CLASS);
    clearSelection();
    document.addEventListener('selectstart', preventSelection);
    document.addEventListener('dragstart', preventSelection);
    document.addEventListener('selectionchange', clearSelection);

    return () => {
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('dragstart', preventSelection);
      document.removeEventListener('selectionchange', clearSelection);
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
    };
  }, [isSeeking]);
}
