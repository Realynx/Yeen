import { useEffect, useRef, type RefObject } from 'react';

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'summary:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const activeLayerStack: symbol[] = [];
let bodyLockDepth = 0;
let bodyOverflowBeforeLock: string | null = null;

function isElementVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  if (element.closest('[aria-hidden="true"]')) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') {
    return false;
  }

  const opacity = Number.parseFloat(style.opacity);
  if (Number.isFinite(opacity) && opacity < 0.08) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)].filter((element) => {
    return isElementVisible(element);
  });
}

function pushLayer(layerId: symbol): void {
  activeLayerStack.push(layerId);
}

function removeLayer(layerId: symbol): void {
  const index = activeLayerStack.lastIndexOf(layerId);
  if (index >= 0) {
    activeLayerStack.splice(index, 1);
  }
}

function isTopLayer(layerId: symbol): boolean {
  return activeLayerStack.length > 0 && activeLayerStack[activeLayerStack.length - 1] === layerId;
}

function lockBodyScroll(): void {
  if (bodyLockDepth === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  bodyLockDepth += 1;
}

function unlockBodyScroll(): void {
  bodyLockDepth = Math.max(0, bodyLockDepth - 1);
  if (bodyLockDepth === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock ?? '';
    bodyOverflowBeforeLock = null;
  }
}

function focusInitialTarget(root: HTMLElement, selector?: string): void {
  const scopedTarget = selector ? root.querySelector<HTMLElement>(selector) : null;
  if (scopedTarget && isElementVisible(scopedTarget)) {
    scopedTarget.focus({ preventScroll: true });
    return;
  }

  const [firstFocusable] = getFocusableElements(root);
  if (firstFocusable) {
    firstFocusable.focus({ preventScroll: true });
    return;
  }

  if (!root.hasAttribute('tabindex')) {
    root.setAttribute('tabindex', '-1');
  }
  root.focus({ preventScroll: true });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function shouldCloseForKey(event: KeyboardEvent, closeOnEscape: boolean, closeOnBack: boolean): boolean {
  return (closeOnEscape && event.key === 'Escape')
    || (closeOnBack && event.key === 'Backspace' && !isEditableTarget(event.target));
}

function trapTabFocus(event: KeyboardEvent, container: HTMLElement): void {
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    event.preventDefault();
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    container.focus({ preventScroll: true });
    return;
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeIndex = active ? focusables.indexOf(active) : -1;
  const step = event.shiftKey ? -1 : 1;
  const nextIndex = activeIndex < 0
    ? (event.shiftKey ? focusables.length - 1 : 0)
    : (activeIndex + step + focusables.length) % focusables.length;
  event.preventDefault();
  focusables[nextIndex]?.focus({ preventScroll: true });
}

export interface UseDialogLayerOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onRequestClose?: () => void;
  initialFocusSelector?: string;
  closeOnEscape?: boolean;
  closeOnBack?: boolean;
  trapFocus?: boolean;
  restoreFocus?: boolean;
  lockBodyScroll?: boolean;
}

export function useDialogLayer({
  open,
  containerRef,
  onRequestClose,
  initialFocusSelector,
  closeOnEscape = true,
  closeOnBack = true,
  trapFocus = true,
  restoreFocus = true,
  lockBodyScroll: shouldLockBodyScroll = true,
}: UseDialogLayerOptions): void {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialRoot = containerRef.current;
    if (!initialRoot) {
      return;
    }
    const root: HTMLElement = initialRoot;

    const layerId = Symbol('yeen-dialog-layer');
    const activeElement = document.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;

    pushLayer(layerId);
    root.setAttribute('data-yeen-layer-open', 'true');

    if (shouldLockBodyScroll) {
      lockBodyScroll();
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!isTopLayer(layerId)) {
        return;
      }

      const container: HTMLElement = containerRef.current ?? root;
      focusInitialTarget(container, initialFocusSelector);
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopLayer(layerId)) {
        return;
      }

      if (shouldCloseForKey(event, closeOnEscape, closeOnBack) && onRequestClose) {
        event.preventDefault();
        event.stopPropagation();
        onRequestClose();
        return;
      }

      if (!trapFocus || event.key !== 'Tab') {
        return;
      }

      trapTabFocus(event, containerRef.current ?? root);
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown, true);

      root.removeAttribute('data-yeen-layer-open');
      removeLayer(layerId);

      if (shouldLockBodyScroll) {
        unlockBodyScroll();
      }

      if (restoreFocus) {
        const restoreTarget = restoreFocusRef.current;
        if (restoreTarget && restoreTarget.isConnected) {
          window.requestAnimationFrame(() => {
            restoreTarget.focus({ preventScroll: true });
          });
        }
      }

      restoreFocusRef.current = null;
    };
  }, [
    closeOnBack,
    closeOnEscape,
    containerRef,
    initialFocusSelector,
    onRequestClose,
    open,
    restoreFocus,
    shouldLockBodyScroll,
    trapFocus,
  ]);
}
