import { useEffect, type RefObject } from 'react';

interface UsePlayerTvControlsFocusOptions {
  isTvMode: boolean;
  showControls: boolean;
  hasOpenMenu: boolean;
  videoShellRef: RefObject<HTMLDivElement | null>;
  closeMenu: () => void;
  onHideControls: () => void;
}

export function usePlayerTvControlsFocus({
  isTvMode,
  showControls,
  hasOpenMenu,
  videoShellRef,
  closeMenu,
  onHideControls,
}: UsePlayerTvControlsFocusOptions): void {
  useEffect(() => {
    if (!isTvMode) {
      return;
    }

    function handleDismissControls() {
      if (hasOpenMenu) {
        closeMenu();
      } else {
        onHideControls();
      }
      videoShellRef.current?.focus({ preventScroll: true });
    }

    window.addEventListener('yeen:tv-player-dismiss-controls', handleDismissControls);
    return () => {
      window.removeEventListener('yeen:tv-player-dismiss-controls', handleDismissControls);
    };
  }, [closeMenu, hasOpenMenu, isTvMode, onHideControls, videoShellRef]);

  useEffect(() => {
    if (!isTvMode || !showControls) {
      return;
    }

    const shell = videoShellRef.current;
    if (!shell) {
      return;
    }

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement
      && shell.contains(activeElement)
      && activeElement !== shell
      && !activeElement.closest('.player-controls-panel.is-hidden')
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = shell.querySelector<HTMLElement>(
        '.player-controls-panel [data-tv-initial-focus], .player-controls-panel button:not([disabled]), .player-controls-panel input:not([disabled])',
      );
      target?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isTvMode, showControls, videoShellRef]);
}
