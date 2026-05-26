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

function playerControlsAreVisible(root: HTMLElement): boolean {
  return Boolean(root.querySelector('.video-shell.controls-visible'));
}

export function TvPageShell({
  pageKey,
  autoFocusFirst = true,
  children,
}: PropsWithChildren<TvPageShellProps>) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement) {
      return;
    }

    if (autoFocusFirst) {
      const frameId = window.requestAnimationFrame(() => {
        const routeKey = routeMemoryKey(pageKey);
        const rememberedFocus = focusTargetFromMemory(
          shellElement,
          routeFocusMemory.get(routeKey),
        );
        const nextFocus = rememberedFocus ?? initialFocusTarget(shellElement);
        if (!nextFocus) {
          return;
        }

        focusElement(nextFocus);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    return;
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
      if (shouldHandleBackKey(event, pageKey)) {
        if (hasOpenDialogLayer()) {
          return;
        }

        if (
          activeElement instanceof HTMLElement
          && isEditableElement(activeElement)
          && !isSelectElement(activeElement)
        ) {
          return;
        }

        if (pageKey === 'player' && playerControlsAreVisible(shellElement)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent(PLAYER_DISMISS_CONTROLS_EVENT));
          return;
        }

        const hasBackHistory = window.history.length > 1;
        const atRootRoute = window.location.pathname === '/';

        if (hasBackHistory) {
          event.preventDefault();
          window.history.back();
          return;
        }

        if (!atRootRoute) {
          event.preventDefault();
          window.location.assign('/');
        }

        return;
      }

      const direction = directionForKey(event.key);
      if (!direction) {
        return;
      }

      if (!(activeElement instanceof HTMLElement) || !shellElement.contains(activeElement)) {
        return;
      }

      const activeIsSelect = isSelectElement(activeElement);

      if (isEditableElement(activeElement) && !activeIsSelect) {
        return;
      }

      const focusables = focusableElementsWithin(shellElement);
      const focusableCandidates = focusables
        .filter((element) => element !== activeElement);

      let nextElement = nextDirectionalElement(activeElement, focusableCandidates, direction);
      if (!nextElement && activeIsSelect) {
        nextElement = nextElementByDomOrder(activeElement, focusables, direction);
      }

      if (nextElement) {
        nextElement = rememberedLaneTarget(shellElement, activeElement, nextElement, direction)
          ?? nextElement;
      }

      if (!nextElement) {
        if (activeIsSelect) {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();
      nextElement.focus({ preventScroll: true });
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const block = shouldCenterFocusedMediaTile(activeElement, nextElement, direction)
        ? 'center'
        : 'nearest';

      nextElement.scrollIntoView({
        block,
        inline: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }

    window.addEventListener('keydown', handleDirectionalKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleDirectionalKeydown, true);
    };
  }, [pageKey]);

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
