import { useEffect, useRef, type PropsWithChildren } from 'react';
import {
  focusableElementsWithin,
  hasOpenDialogLayer,
  isEditableElement,
  isSelectElement,
  shouldHandleBackKey,
} from './tvDirectionalFocus.helpers';
import {
  directionForKey,
  nextDirectionalElement,
  nextElementByDomOrder,
  shouldCenterFocusedMediaTile,
} from './tvDirectionalFocus.navigation.helpers';
import { useSafeBackNavigation } from '../services/safeBackNavigation';

type TvFocusDirection = NonNullable<ReturnType<typeof directionForKey>>;

interface TvFocusMemoryEntry {
  focusKey: string | null;
  laneId: string | null;
  laneIndex: number | null;
}

const routeFocusMemory = new Map<string, TvFocusMemoryEntry>();
const laneFocusMemory = new Map<string, TvFocusMemoryEntry>();
const PLAYER_DISMISS_CONTROLS_EVENT = 'yeen:tv-player-dismiss-controls';

interface TvPageShellProps {
  pageKey: string;
  autoFocusFirst?: boolean;
}

function handleTvBackKey(
  event: KeyboardEvent,
  pageKey: string,
  shell: HTMLElement,
  active: Element | null,
  navigateBack: () => void,
): boolean {
  if (!shouldHandleBackKey(event, pageKey)) return false;
  if (hasOpenDialogLayer()) return true;
  if (active instanceof HTMLElement && isEditableElement(active) && !isSelectElement(active)) {
    if (event.key === 'Backspace' && editableHasText(active)) return true;
    event.preventDefault();
    active.blur();
    initialFocusTarget(shell)?.focus({ preventScroll: true });
    return true;
  }
  if (pageKey === 'player' && playerControlsCanBeDismissed(shell)) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(PLAYER_DISMISS_CONTROLS_EVENT));
    return true;
  }
  event.preventDefault();
  navigateBack();
  return true;
}

function nextTvFocusTarget(
  root: HTMLElement,
  active: HTMLElement,
  direction: TvFocusDirection,
  activeIsSelect: boolean,
): HTMLElement | null {
  const focusables = focusableElementsWithin(root);
  let next = nextDirectionalElement(active, focusables.filter((element) => element !== active), direction);
  if (!next && activeIsSelect) next = nextElementByDomOrder(active, focusables, direction);
  return next ? rememberedLaneTarget(root, active, next, direction) ?? next : null;
}

function focusTvTarget(active: HTMLElement, next: HTMLElement, direction: TvFocusDirection): void {
  next.focus({ preventScroll: true });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  next.scrollIntoView({
    block: shouldCenterFocusedMediaTile(active, next, direction) ? 'center' : 'nearest',
    inline: 'nearest',
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
}

function routeMemoryKey(pageKey: string): string {
  return `${pageKey}:${window.location.pathname}${window.location.search}`;
}

function focusKeyFor(element: HTMLElement): string | null {
  return element.closest<HTMLElement>('[data-tv-focus-key]')?.dataset.tvFocusKey ?? null;
}

function focusLaneIdFor(element: HTMLElement): string | null {
  return element.closest<HTMLElement>('[data-tv-focus-lane-id]')?.dataset.tvFocusLaneId ?? null;
}

function laneFocusablesWithin(root: HTMLElement, laneId: string | null): HTMLElement[] {
  const focusables = focusableElementsWithin(root);
  if (!laneId) {
    return focusables;
  }

  return focusables.filter((element) => focusLaneIdFor(element) === laneId);
}

function memoryEntryFor(root: HTMLElement, element: HTMLElement): TvFocusMemoryEntry {
  const laneId = focusLaneIdFor(element);
  const laneFocusables = laneFocusablesWithin(root, laneId);
  const laneIndex = laneFocusables.indexOf(element);

  return {
    focusKey: focusKeyFor(element),
    laneId,
    laneIndex: laneIndex >= 0 ? laneIndex : null,
  };
}

function focusTargetFromMemory(
  root: HTMLElement,
  memory: TvFocusMemoryEntry | undefined,
): HTMLElement | null {
  if (!memory) {
    return null;
  }

  const focusables = focusableElementsWithin(root);
  if (memory.focusKey) {
    const keyedElement = focusables.find(
      (element) => focusKeyFor(element) === memory.focusKey,
    );
    if (keyedElement) {
      return keyedElement;
    }
  }

  if (memory.laneId && memory.laneIndex !== null) {
    const laneFocusables = focusables.filter(
      (element) => focusLaneIdFor(element) === memory.laneId,
    );
    if (laneFocusables.length > 0) {
      return laneFocusables[Math.min(memory.laneIndex, laneFocusables.length - 1)] ?? null;
    }
  }

  return null;
}

function initialFocusTarget(root: HTMLElement): HTMLElement | null {
  const focusables = focusableElementsWithin(root);
  const markedTargets = [
    ...root.querySelectorAll<HTMLElement>('[data-tv-initial-focus]'),
  ];

  for (const target of markedTargets) {
    if (focusables.includes(target)) {
      return target;
    }

    const nestedFocusable = focusables.find((element) => target.contains(element));
    if (nestedFocusable) {
      return nestedFocusable;
    }
  }

  return focusables[0] ?? null;
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rememberedLaneTarget(
  root: HTMLElement,
  current: HTMLElement,
  next: HTMLElement,
  direction: TvFocusDirection,
): HTMLElement | null {
  if (direction !== 'up' && direction !== 'down') {
    return null;
  }

  const routeKey = routeMemoryKey(root.dataset.tvPageKey ?? '');
  const currentLaneId = focusLaneIdFor(current);
  const nextLaneId = focusLaneIdFor(next);
  if (!nextLaneId || nextLaneId === currentLaneId) {
    return null;
  }

  const remembered = focusTargetFromMemory(
    root,
    laneFocusMemory.get(`${routeKey}:${nextLaneId}`),
  );
  if (!remembered || remembered === current || focusLaneIdFor(remembered) !== nextLaneId) {
    return null;
  }

  return remembered;
}

function playerControlsCanBeDismissed(root: HTMLElement): boolean {
  return Boolean(root.querySelector('[data-tv-controls-dismissible="true"]'));
}

function editableHasText(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.length > 0;
  }

  return (element.textContent ?? '').length > 0;
}

export function TvPageShell({
  pageKey,
  autoFocusFirst = true,
  children,
}: PropsWithChildren<TvPageShellProps>) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const navigateBackSafely = useSafeBackNavigation();

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement || !autoFocusFirst) {
      return;
    }
    const currentShellElement = shellElement;

    let frameId: number | null = null;

    function requestPreferredFocus() {
      if (currentShellElement.contains(document.activeElement)) {
        return;
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (currentShellElement.contains(document.activeElement)) {
          return;
        }

        const routeKey = routeMemoryKey(pageKey);
        const rememberedFocus = focusTargetFromMemory(
          currentShellElement,
          routeFocusMemory.get(routeKey),
        );
        const nextFocus = rememberedFocus ?? initialFocusTarget(currentShellElement);
        if (nextFocus) {
          focusElement(nextFocus);
        }
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestPreferredFocus();
      }
    }

    requestPreferredFocus();
    window.addEventListener('focus', requestPreferredFocus);
    window.addEventListener('pageshow', requestPreferredFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('focus', requestPreferredFocus);
      window.removeEventListener('pageshow', requestPreferredFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoFocusFirst, pageKey]);

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement) {
      return;
    }
    const currentShellElement = shellElement;

    function handleFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !currentShellElement.contains(target)) {
        return;
      }

      const routeKey = routeMemoryKey(pageKey);
      const memory = memoryEntryFor(currentShellElement, target);
      routeFocusMemory.set(routeKey, memory);

      if (memory.laneId) {
        laneFocusMemory.set(`${routeKey}:${memory.laneId}`, memory);
      }
    }

    currentShellElement.addEventListener('focusin', handleFocusIn);
    return () => {
      currentShellElement.removeEventListener('focusin', handleFocusIn);
    };
  }, [pageKey]);

  useEffect(() => {
    if (!shellRef.current) {
      return;
    }

    function handleDirectionalKeydown(event: KeyboardEvent) {
      const shellElement = shellRef.current;
      if (!shellElement) {
        return;
      }

      const activeElement = document.activeElement;
      if (handleTvBackKey(event, pageKey, shellElement, activeElement, navigateBackSafely)) return;

      const direction = directionForKey(event.key);
      if (!direction) {
        return;
      }

      if (!(activeElement instanceof HTMLElement) || !shellElement.contains(activeElement)) {
        const firstTarget = initialFocusTarget(shellElement);
        if (firstTarget) {
          event.preventDefault();
          focusElement(firstTarget);
        }
        return;
      }

      const activeIsSelect = isSelectElement(activeElement);

      if (isEditableElement(activeElement) && !activeIsSelect) {
        return;
      }

      const openLayer = shellElement.querySelector<HTMLElement>(
        '[data-yeen-layer-open="true"]',
      );
      const focusRoot = openLayer ?? shellElement;
      if (!focusRoot.contains(activeElement)) {
        initialFocusTarget(focusRoot)?.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }

      const nextElement = nextTvFocusTarget(focusRoot, activeElement, direction, activeIsSelect);

      if (!nextElement) {
        if (activeIsSelect) {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();
      focusTvTarget(activeElement, nextElement, direction);
    }

    window.addEventListener('keydown', handleDirectionalKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleDirectionalKeydown, true);
    };
  }, [navigateBackSafely, pageKey]);

  return (
    <div
      ref={shellRef}
      className={`tv-page-shell tv-page-shell-${pageKey}`}
      data-tv-page-key={pageKey}
    >
      {children}
    </div>
  );
}
