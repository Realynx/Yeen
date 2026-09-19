import { useEffect } from 'react';
import { SKIP_SECONDS } from './playerUtils';

interface UsePlayerKeyboardShortcutsOptions {
  enabled?: boolean;
  isTvMode?: boolean;
  controlsVisible?: boolean;
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

function isTextEntryTarget(target: HTMLElement | null): boolean {
  return Boolean(target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? ''));
}

function interactiveContext(target: HTMLElement | null) {
  const element = target?.closest(
    'button, a[href], input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])',
  ) as HTMLElement | null;
  const playerSurface = Boolean(target?.closest('[data-player-video-surface="true"]'));
  const interactive = Boolean(target && (
    ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || (element && !playerSurface)
  ));
  return { element, playerSurface, interactive };
}

function handleTvDirectional(
  event: KeyboardEvent,
  key: string,
  options: UsePlayerKeyboardShortcutsOptions,
): boolean {
  const directional = ['arrowright', 'arrowleft', 'arrowup', 'arrowdown'].includes(key);
  if (!options.isTvMode || !directional) return false;
  if (!options.controlsVisible && (key === 'arrowright' || key === 'arrowleft')) {
    event.preventDefault();
    const direction = key === 'arrowright' ? 1 : -1;
    options.skipBy(direction * SKIP_SECONDS * (event.repeat ? 3 : 1));
    return true;
  }
  options.revealControls();
  return true;
}

function handleTvActivation(
  event: KeyboardEvent,
  key: string,
  options: UsePlayerKeyboardShortcutsOptions,
  context: ReturnType<typeof interactiveContext>,
): boolean {
  if (!options.isTvMode || (key !== 'enter' && key !== ' ')) return false;
  if (!context.interactive || !options.controlsVisible || context.playerSurface) {
    event.preventDefault();
    void options.togglePlay();
    options.revealControls();
    return true;
  }
  if (key === 'enter' && context.element) {
    const opacity = Number.parseFloat(window.getComputedStyle(context.element).opacity);
    if (Number.isFinite(opacity) && opacity < 0.08) {
      event.preventDefault();
      options.revealControls();
    }
  }
  return true;
}

function shortcutActions(options: UsePlayerKeyboardShortcutsOptions): Record<string, () => void> {
  const play = () => { void options.togglePlay(); options.revealControls(); };
  return {
    ' ': play, k: play,
    arrowright: () => options.skipBy(SKIP_SECONDS), l: () => options.skipBy(SKIP_SECONDS),
    arrowleft: () => options.skipBy(-SKIP_SECONDS), j: () => options.skipBy(-SKIP_SECONDS),
    arrowup: () => { options.applyVolume(options.volume + 0.05); options.revealControls(); },
    arrowdown: () => { options.applyVolume(options.volume - 0.05); options.revealControls(); },
    m: options.toggleMute,
    f: () => { void options.toggleFullscreen(); },
    c: options.toggleSubtitleVisibility,
    p: () => { void options.togglePictureInPicture(); },
    '.': () => options.adjustPlaybackRate(0.25), '>': () => options.adjustPlaybackRate(0.25),
    ',': () => options.adjustPlaybackRate(-0.25), '<': () => options.adjustPlaybackRate(-0.25),
  };
}

function handleKeyboardShortcut(event: KeyboardEvent, options: UsePlayerKeyboardShortcutsOptions): void {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  if (isTextEntryTarget(target)) return;
  const key = event.key.toLowerCase();
  const context = interactiveContext(target);
  if (handleTvDirectional(event, key, options)) return;
  if (handleTvActivation(event, key, options, context)) return;
  if (key === 'enter' && (!options.isTvMode || context.interactive)) return;
  if (key === 'escape') {
    if (options.isTvMode) { event.preventDefault(); options.revealControls(); }
    return;
  }
  if (key === 'f' && options.isTvMode) return;
  const action = shortcutActions(options)[key];
  if (action) { event.preventDefault(); action(); }
}

export function usePlayerKeyboardShortcuts({
  enabled = true,
  isTvMode = false,
  controlsVisible = true,
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

    const options = {
      enabled, isTvMode, controlsVisible, applyVolume, revealControls, skipBy,
      toggleFullscreen, toggleMute, togglePictureInPicture, togglePlay,
      toggleSubtitleVisibility, adjustPlaybackRate, volume,
    };
    function handleKeyboardShortcuts(event: KeyboardEvent) {
      handleKeyboardShortcut(event, options);
    }

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [
    enabled,
    isTvMode,
    controlsVisible,
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
