function maxPrimaryDistancePx(): number {
  if (typeof window === 'undefined') {
    return 2400;
  }

  return Math.max(900, Math.min(window.innerWidth * 0.75, 2400));
}

type Direction = 'left' | 'right' | 'up' | 'down';
type FocusZone = 'top-nav' | 'hero' | 'shelf' | 'footer' | 'other';

interface DirectionalCandidateScore {
  score: number;
  overlapsOrthogonalAxis: boolean;
}

interface ScoredCandidate extends DirectionalCandidateScore {
  element: HTMLElement;
  zone: FocusZone;
}

function isHorizontal(direction: Direction): boolean {
  return direction === 'left' || direction === 'right';
}

function isInDirection(deltaX: number, deltaY: number, direction: Direction): boolean {
  const distanceByDirection: Record<Direction, number> = {
    left: -deltaX,
    right: deltaX,
    up: -deltaY,
    down: deltaY,
  };
  return distanceByDirection[direction] > 2;
}

export function directionForKey(key: string): Direction | null {
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
    explicitZone === 'top-nav' ||
    explicitZone === 'hero' ||
    explicitZone === 'shelf' ||
    explicitZone === 'footer' ||
    explicitZone === 'other'
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

function preferredZonesFor(
  currentZone: FocusZone,
  direction: Direction,
): FocusZone[] {
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

  if (!isInDirection(deltaX, deltaY, direction)) return null;
  const primaryDistance = isHorizontal(direction)
    ? Math.abs(deltaX)
    : Math.abs(deltaY);
  if (primaryDistance > maxPrimaryDistancePx()) {
    return null;
  }

  const orthogonalDistance = isHorizontal(direction)
    ? Math.abs(deltaY)
    : Math.abs(deltaX);

  const orthogonalOverlap = isHorizontal(direction)
    ? Math.min(currentRect.bottom, candidateRect.bottom) - Math.max(currentRect.top, candidateRect.top)
    : Math.min(currentRect.right, candidateRect.right) - Math.max(currentRect.left, candidateRect.left);
  const overlapsOrthogonalAxis = orthogonalOverlap > 1;
  const orthogonalWeight = overlapsOrthogonalAxis ? 1.35 : 4.5;

  return {
    score: primaryDistance + orthogonalDistance * orthogonalWeight,
    overlapsOrthogonalAxis,
  };
}

function preferCandidates(
  candidates: ScoredCandidate[],
  predicate: (candidate: ScoredCandidate) => boolean,
): ScoredCandidate[] {
  const preferred = candidates.filter(predicate);
  return preferred.length > 0 ? preferred : candidates;
}

function preferMediaTiles(
  candidates: ScoredCandidate[],
  currentTile: HTMLElement | null,
  direction: Direction,
): ScoredCandidate[] {
  if (!currentTile) return candidates;
  if (isHorizontal(direction)) {
    return preferCandidates(candidates, (candidate) => Boolean(mediaTileFor(candidate.element)));
  }
  const currentRow = mediaRowFor(currentTile);
  const differentRow = candidates.filter((candidate) => {
    const tile = mediaTileFor(candidate.element);
    const row = tile ? mediaRowFor(tile) : null;
    return Boolean(tile && tile !== currentTile && row && currentRow && row !== currentRow);
  });
  if (differentRow.length > 0) return differentRow;
  return preferCandidates(candidates, (candidate) => {
    const tile = mediaTileFor(candidate.element);
    const row = tile ? mediaRowFor(tile) : null;
    return !tile || !(row && currentRow && row === currentRow);
  });
}

export function nextDirectionalElement(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: Direction,
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const currentZone = focusZoneFor(current);
  const currentLaneId = focusLaneIdFor(current);
  const scoredCandidates: ScoredCandidate[] = [];

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

  if (currentLaneId && isHorizontal(direction)) {
    workingCandidates = preferCandidates(
      workingCandidates,
      (candidate) => focusLaneIdFor(candidate.element) === currentLaneId,
    );
  }
  workingCandidates = preferMediaTiles(workingCandidates, mediaTileFor(current), direction);

  const preferredZones = preferredZonesFor(currentZone, direction);
  if (preferredZones.length > 0) {
    workingCandidates = preferCandidates(
      workingCandidates,
      (candidate) => preferredZones.includes(candidate.zone),
    );
  }

  const alignedCandidates = workingCandidates.filter(
    (candidate) => candidate.overlapsOrthogonalAxis,
  );
  if (alignedCandidates.length > 0) workingCandidates = alignedCandidates;

  let bestCandidate = workingCandidates[0];
  for (const candidate of workingCandidates) {
    if (candidate.score < bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate.element;
}

export function nextElementByDomOrder(
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

export function shouldCenterFocusedMediaTile(
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
