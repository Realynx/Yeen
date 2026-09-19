const DISMISSIBLE_LAYER_SELECTOR = [
  'dialog[open]',
  '[role="dialog"]',
  '.player-menu',
  '.player-context-menu',
  '.profile-dropdown',
  '.addon-host-modal',
].join(',');

export interface AndroidBackWindow {
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'back'>;
}

export interface AndroidBackDocument {
  activeElement?: {
    matches: (selector: string) => boolean;
    blur?: () => void;
  } | null;
  fullscreenElement: Element | null;
  exitFullscreen?: () => Promise<void>;
  querySelector: (selector: string) => Element | null;
  dispatchEvent: (event: Event) => boolean;
}

export function handleAndroidBackNavigation(
  targetWindow: AndroidBackWindow,
  targetDocument: AndroidBackDocument,
): boolean {
  const activeElement = targetDocument.activeElement;
  if (
    activeElement?.matches('input, textarea, [contenteditable="true"]')
    && typeof activeElement.blur === 'function'
  ) {
    activeElement.blur();
    return true;
  }

  if (targetDocument.fullscreenElement && targetDocument.exitFullscreen) {
    void targetDocument.exitFullscreen();
    return true;
  }

  if (targetDocument.querySelector(DISMISSIBLE_LAYER_SELECTOR)) {
    targetDocument.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }));
    return true;
  }

  const { pathname, search, hash } = targetWindow.location;
  if (pathname !== '/' || search || hash) {
    targetWindow.history.back();
    return true;
  }

  return false;
}

declare global {
  interface Window {
    __yeenHandleAndroidBack?: () => boolean;
  }
}

export function installAndroidBackNavigation(
  targetWindow: Window,
  targetDocument: Document,
): () => void {
  const handler = () => handleAndroidBackNavigation(targetWindow, targetDocument);
  targetWindow.__yeenHandleAndroidBack = handler;

  return () => {
    if (targetWindow.__yeenHandleAndroidBack === handler) {
      delete targetWindow.__yeenHandleAndroidBack;
    }
  };
}
