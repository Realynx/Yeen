import { useEffect, useRef } from 'react';
import type { PropsWithChildren } from 'react';

const TV_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const MAX_PRIMARY_DISTANCE_PX = 900;

type Direction = 'left' | 'right' | 'up' | 'down';
type FocusZone = 'top-nav' | 'hero' | 'shelf' | 'footer' | 'other';

interface DirectionalCandidateScore {
  score: number;
  overlapsOrthogonalAxis: boolean;
}

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
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return true;
}

function isEditableElement(element: HTMLElement): boolean {
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable;
}

function isSelectElement(element: HTMLElement): element is HTMLSelectElement {
  return element.tagName === 'SELECT';
}

function focusableElementsWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TV_FOCUSABLE_SELECTOR)]
    .filter((element) => isElementVisible(element));
}

function directionForKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      return null;
  }
}

function mediaTileFor(element: HTMLElement): HTMLElement | null {
  return element.closest('.media-tile');
}

function mediaRowFor(element: HTMLElement): HTMLElement | null {
  return element.closest('.media-row');
}

function focusZoneFor(element: HTMLElement): FocusZone {
  const explicitZone = element.closest<HTMLElement>('[data-tv-focus-zone]')?.dataset.tvFocusZone;
  if (
    explicitZone === 'top-nav'
    || explicitZone === 'hero'
    || explicitZone === 'shelf'
    || explicitZone === 'footer'
    || explicitZone === 'other'
  ) {
    return explicitZone;
  }

  if (element.closest('.top-nav')) {
    return 'top-nav';
  }

  if (element.closest('.hero-banner')) {
    return 'hero';
  }

  if (element.closest('.media-row') || element.closest('.browse-section')) {
    return 'shelf';
  }

  if (element.closest('.home-footer')) {
    return 'footer';
  }

  return 'other';
}

function focusLaneIdFor(element: HTMLElement): string | null {
  return element.closest<HTMLElement>('[data-tv-focus-lane-id]')?.dataset.tvFocusLaneId ?? null;
}

function focusPriorityPenaltyFor(element: HTMLElement): number {
  const priority =
    element.closest<HTMLElement>('[data-tv-focus-priority]')?.dataset.tvFocusPriority
    ?? element.getAttribute('data-tv-focus-priority');

  if (priority === 'high') {
    return -120;
  }

  if (priority === 'low') {
    return 520;
  }

  return 0;
}

function preferredZonesFor(currentZone: FocusZone, direction: Direction): FocusZone[] {
  if (currentZone === 'top-nav') {
    if (direction === 'down') {
      return ['hero', 'shelf', 'top-nav'];
    }

    return ['top-nav'];
  }

  if (currentZone === 'hero') {
    if (direction === 'up') {
      return ['hero', 'top-nav'];
    }

    if (direction === 'down') {
      return ['shelf', 'hero'];
    }

    return ['hero'];
  }

  if (currentZone === 'shelf') {
    if (direction === 'up') {
      return ['shelf', 'hero', 'top-nav'];
    }

    if (direction === 'down') {
      return ['shelf', 'footer'];
    }

    return ['shelf'];
  }

  if (currentZone === 'footer') {
    if (direction === 'up') {
      return ['shelf', 'hero'];
    }

    return ['footer'];
  }

  return [];
}

function scoreDirectionalCandidate(
  currentRect: DOMRect,
  candidateRect: DOMRect,
  direction: Direction,
): DirectionalCandidateScore | null {
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;
  const candidateCenterX = candidateRect.left + candidateRect.width / 2;
  const candidateCenterY = candidateRect.top + candidateRect.height / 2;
  const deltaX = candidateCenterX - currentCenterX;
  const deltaY = candidateCenterY - currentCenterY;

  if (direction === 'left' && deltaX >= -2) {
    return null;
  }

  if (direction === 'right' && deltaX <= 2) {
    return null;
  }

  if (direction === 'up' && deltaY >= -2) {
    return null;
  }

  if (direction === 'down' && deltaY <= 2) {
    return null;
  }

  const primaryDistance = direction === 'left' || direction === 'right'
    ? Math.abs(deltaX)
    : Math.abs(deltaY);
  if (primaryDistance > MAX_PRIMARY_DISTANCE_PX) {
    return null;
  }

  const orthogonalDistance = direction === 'left' || direction === 'right'
    ? Math.abs(deltaY)
    : Math.abs(deltaX);

  const orthogonalOverlap = direction === 'left' || direction === 'right'
    ? Math.min(currentRect.bottom, candidateRect.bottom) - Math.max(currentRect.top, candidateRect.top)
    : Math.min(currentRect.right, candidateRect.right) - Math.max(currentRect.left, candidateRect.left);
  const overlapsOrthogonalAxis = orthogonalOverlap > 1;
  const orthogonalWeight = overlapsOrthogonalAxis ? 1.35 : 4.5;

  return {
    score: primaryDistance + orthogonalDistance * orthogonalWeight,
    overlapsOrthogonalAxis,
  };
}

function nextDirectionalElement(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: Direction,
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const currentZone = focusZoneFor(current);
  const currentLaneId = focusLaneIdFor(current);
  const scoredCandidates: Array<{
    element: HTMLElement;
    zone: FocusZone;
    score: number;
    overlapsOrthogonalAxis: boolean;
  }> = [];

  for (const candidate of candidates) {
    const candidateScore = scoreDirectionalCandidate(
      currentRect,
      candidate.getBoundingClientRect(),
      direction,
    );
    if (!candidateScore) {
      continue;
    }

    const priorityPenalty = focusPriorityPenaltyFor(candidate);
    scoredCandidates.push({
      element: candidate,
      zone: focusZoneFor(candidate),
      score: candidateScore.score + priorityPenalty,
      overlapsOrthogonalAxis: candidateScore.overlapsOrthogonalAxis,
    });
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  let workingCandidates = scoredCandidates;

  if (currentLaneId && (direction === 'left' || direction === 'right')) {
    const sameLaneCandidates = workingCandidates.filter(
      (candidate) => focusLaneIdFor(candidate.element) === currentLaneId,
    );
    if (sameLaneCandidates.length > 0) {
      workingCandidates = sameLaneCandidates;
    }
  }

  const currentTile = mediaTileFor(current);
  if (currentTile) {
    if (direction === 'left' || direction === 'right') {
      const mediaTileCandidates = workingCandidates.filter((candidate) => mediaTileFor(candidate.element));
      if (mediaTileCandidates.length > 0) {
        workingCandidates = mediaTileCandidates;
      }
    } else {
      const currentTileRow = mediaRowFor(currentTile);
      const differentRowMediaTileCandidates = workingCandidates.filter((candidate) => {
        const candidateTile = mediaTileFor(candidate.element);
        if (!candidateTile || candidateTile === currentTile) {
          return false;
        }

        const candidateTileRow = mediaRowFor(candidateTile);
        return Boolean(candidateTileRow && currentTileRow && candidateTileRow !== currentTileRow);
      });

      if (differentRowMediaTileCandidates.length > 0) {
        workingCandidates = differentRowMediaTileCandidates;
      } else {
        // Avoid vertical "ping-pong" where focus jumps between nearby tiles in the same row.
        const withoutSameRowMediaTiles = workingCandidates.filter((candidate) => {
          const candidateTile = mediaTileFor(candidate.element);
          if (!candidateTile) {
            return true;
          }

          const candidateTileRow = mediaRowFor(candidateTile);
          return !(candidateTileRow && currentTileRow && candidateTileRow === currentTileRow);
        });

        if (withoutSameRowMediaTiles.length > 0) {
          workingCandidates = withoutSameRowMediaTiles;
        }
      }
    }
  }

  const preferredZones = preferredZonesFor(currentZone, direction);
  if (preferredZones.length > 0) {
    const preferredZoneCandidates = workingCandidates.filter((candidate) =>
      preferredZones.includes(candidate.zone),
    );
    if (preferredZoneCandidates.length > 0) {
      workingCandidates = preferredZoneCandidates;
    }
  }

  const alignedCandidates = workingCandidates.filter((candidate) => candidate.overlapsOrthogonalAxis);
  if (alignedCandidates.length > 0) {
    workingCandidates = alignedCandidates;
  }

  let bestCandidate = workingCandidates[0];
  for (const candidate of workingCandidates) {
    if (candidate.score < bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate.element;
}

function nextElementByDomOrder(
  current: HTMLElement,
  focusables: HTMLElement[],
  direction: Direction,
): HTMLElement | null {
  const currentIndex = focusables.indexOf(current);
  if (currentIndex < 0) {
    return null;
  }

  const step = direction === 'left' || direction === 'up' ? -1 : 1;
  for (
    let nextIndex = currentIndex + step;
    nextIndex >= 0 && nextIndex < focusables.length;
    nextIndex += step
  ) {
    const candidate = focusables[nextIndex];
    if (candidate && candidate !== current) {
      return candidate;
    }
  }

  return null;
}

function shouldCenterFocusedMediaTile(
  current: HTMLElement,
  next: HTMLElement,
  direction: Direction,
): boolean {
  if (direction !== 'up' && direction !== 'down') {
    return false;
  }

  const currentTile = mediaTileFor(current);
  const nextTile = mediaTileFor(next);
  if (!currentTile || !nextTile) {
    return false;
  }

  const currentRow = mediaRowFor(currentTile);
  const nextRow = mediaRowFor(nextTile);
  return Boolean(currentRow && nextRow && currentRow !== nextRow);
}

function hasOpenDialogLayer(): boolean {
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

function shouldHandleBackKey(event: KeyboardEvent, pageKey: string): boolean {
  if (event.key === 'Backspace') {
    return true;
  }

  // Player uses Escape to reveal controls in TV mode; keep that behavior.
  return event.key === 'Escape' && pageKey !== 'player';
}

interface TvPageShellProps {
  pageKey: string;
  autoFocusFirst?: boolean;
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
        const firstFocusable = focusableElementsWithin(shellElement)[0];
        if (!firstFocusable) {
          return;
        }

        firstFocusable.focus({ preventScroll: true });
        firstFocusable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    return;
  }, [autoFocusFirst, pageKey]);

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
    <div ref={shellRef} className={`tv-page-shell tv-page-shell-${pageKey}`}>
      {children}
    </div>
  );
}
