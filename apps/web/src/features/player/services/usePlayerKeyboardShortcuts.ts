import { useEffect } from 'react';
import { SKIP_SECONDS } from './playerUtils';

interface UsePlayerKeyboardShortcutsOptions {
  enabled?: boolean;
  isTvMode?: boolean;
  applyVolume: (nextVolume: number) => void;
  revealControls: () => void;
  skipBy: (deltaSeconds: number) => void;
  toggleFullscreen: () => Promise<void>;
  toggleMute: () => void;
  togglePictureInPicture: () => Promise<void>;
  togglePlay: () => Promise<void>;
  toggleSubtitleVisibility: () => void;
  adjustPlaybackRate: (delta: number) => void;
  volume: number;
}

export function usePlayerKeyboardShortcuts({
  enabled = true,
  isTvMode = false,
  applyVolume,
  revealControls,
  skipBy,
  toggleFullscreen,
  toggleMute,
  togglePictureInPicture,
  togglePlay,
  toggleSubtitleVisibility,
  adjustPlaybackRate,
  volume,
}: UsePlayerKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyboardShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const isInteractiveTarget = Boolean(
        target
        && (
          tagName === 'BUTTON'
          || tagName === 'A'
          || tagName === 'INPUT'
          || tagName === 'TEXTAREA'
          || tagName === 'SELECT'
          || target.closest(
            'button, a[href], input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])',
          )
        ),
      );

      if (
        isTvMode
        && isInteractiveTarget
        && (
          key === 'enter'
          || key === 'arrowright'
          || key === 'arrowleft'
          || key === 'arrowup'
          || key === 'arrowdown'
        )
      ) {
        return;
      }

      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault();
          void togglePlay();
          revealControls();
          break;
        case 'arrowright':
        case 'l':
          event.preventDefault();
          skipBy(SKIP_SECONDS);
          break;
        case 'arrowleft':
        case 'j':
          event.preventDefault();
          skipBy(-SKIP_SECONDS);
          break;
        case 'arrowup':
          event.preventDefault();
          applyVolume(volume + 0.05);
          revealControls();
          break;
        case 'arrowdown':
          event.preventDefault();
          applyVolume(volume - 0.05);
          revealControls();
          break;
        case 'enter':
          if (!isTvMode || isInteractiveTarget) {
            break;
          }

          event.preventDefault();
          void togglePlay();
          revealControls();
          break;
        case 'escape':
          if (!isTvMode) {
            break;
          }

          event.preventDefault();
          revealControls();
          break;
        case 'm':
          event.preventDefault();
          toggleMute();
          break;
        case 'f':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'c':
          event.preventDefault();
          toggleSubtitleVisibility();
          break;
        case 'p':
          event.preventDefault();
          void togglePictureInPicture();
          break;
        case '.':
        case '>':
          event.preventDefault();
          adjustPlaybackRate(0.25);
          break;
        case ',':
        case '<':
          event.preventDefault();
          adjustPlaybackRate(-0.25);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [
    enabled,
    isTvMode,
    adjustPlaybackRate,
    applyVolume,
    revealControls,
    skipBy,
    toggleFullscreen,
    toggleMute,
    togglePictureInPicture,
    togglePlay,
    toggleSubtitleVisibility,
    volume,
  ]);
}
