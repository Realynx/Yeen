const TV_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isElementVisible(element: HTMLElement): boolean {
  if (!element.isConnected) {
    return false;
  }

  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.hidden ||
      current.getAttribute('aria-hidden') === 'true' ||
      current.hasAttribute('inert')
    ) {
      return false;
    }

    const currentStyle = window.getComputedStyle(current);
    if (currentStyle.visibility === 'hidden' || currentStyle.display === 'none') {
      return false;
    }

    const currentOpacity = Number.parseFloat(currentStyle.opacity);
    if (Number.isFinite(currentOpacity) && currentOpacity < 0.08) {
      return false;
    }
  }

  if (element.closest('[aria-hidden="true"], [inert]')) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.pointerEvents === 'none') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return true;
}

export function isEditableElement(element: HTMLElement): boolean {
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable;
}

export function isSelectElement(
  element: HTMLElement,
): element is HTMLSelectElement {
  return element.tagName === 'SELECT';
}

export function focusableElementsWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TV_FOCUSABLE_SELECTOR)]
    .filter((element) => isElementVisible(element));
}

export function hasOpenDialogLayer(): boolean {
  const openLayers = [
    ...document.querySelectorAll<HTMLElement>('[data-yeen-layer-open="true"]'),
    ...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
    ...document.querySelectorAll<HTMLElement>('[role="menu"]'),
  ];

  for (const layer of openLayers) {
    if (isElementVisible(layer)) {
      return true;
    }
  }

  return false;
}

export function shouldHandleBackKey(
  event: KeyboardEvent,
  pageKey: string,
): boolean {
  if (event.key === 'Backspace') {
    return true;
  }

  return event.key === 'Escape' && pageKey !== 'player';
}
