import type { MediaItem, ProgressEntry } from '../../shared/services/types';
import { toProgressPercent } from './homePageUtils';

export interface ContinueWatchingEntry {
  item: MediaItem;
  percent: number;
  lastWatchedAt: number;
}

const MIN_CONTINUE_SECONDS = 60;
const MIN_CONTINUE_PERCENT = 2;
const MAX_CONTINUE_PERCENT = 95;
const CONTINUE_WATCHING_LIMIT = 18;
const DISMISSED_CONTINUE_PREFIX = 'yeen_dismissed_continue_watching_v1:';

export function readDismissedContinueWatchingIds(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${DISMISSED_CONTINUE_PREFIX}${userId}`);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

export function writeDismissedContinueWatchingIds(userId: string, ids: Set<string>): void {
  window.localStorage.setItem(
    `${DISMISSED_CONTINUE_PREFIX}${userId}`,
    JSON.stringify([...ids]),
  );
}

export function buildContinueWatchingEntries(
  mediaItems: readonly MediaItem[],
  progressMap: ReadonlyMap<string, ProgressEntry>,
  dismissedIds: ReadonlySet<string>,
  options?: {
    limit?: number;
  },
): ContinueWatchingEntry[] {
  return mediaItems
    .map((item) => toContinueWatchingEntry(item, progressMap.get(item.id), dismissedIds))
    .filter((entry): entry is ContinueWatchingEntry => entry !== null)
    .sort((left, right) => {
      if (right.lastWatchedAt !== left.lastWatchedAt) {
        return right.lastWatchedAt - left.lastWatchedAt;
      }

      return left.item.title.localeCompare(right.item.title, undefined, {
        sensitivity: 'base',
      });
    })
    .slice(0, options?.limit ?? CONTINUE_WATCHING_LIMIT);
}

function toContinueWatchingEntry(
  item: MediaItem,
  progress: ProgressEntry | undefined,
  dismissedIds: ReadonlySet<string>,
): ContinueWatchingEntry | null {
  const percent = toProgressPercent(progress);
  if (
    !progress
    || progress.completed
    || dismissedIds.has(item.id)
    || typeof percent !== 'number'
    || percent < MIN_CONTINUE_PERCENT
    || percent >= MAX_CONTINUE_PERCENT
    || progress.positionSeconds < MIN_CONTINUE_SECONDS
  ) {
    return null;
  }

  const updatedAtMs = Date.parse(progress.updatedAt);
  return {
    item,
    percent,
    lastWatchedAt: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  };
}
