import type { MediaItem } from '../../shared/services/types';
import { normalizeTitleKey } from './mediaDetailsUtils';

export const PENDING_REMOTE_STREAM_TARGET_STORAGE_KEY =
  'yeen.pendingRemoteStreamTarget.v1';

export interface PendingLocalStreamTarget {
  remoteMediaId: string;
  sourceResultId: string;
  title: string;
  normalizedTitle: string;
  releaseYear: number | null;
  type: 'movie' | 'show' | 'other';
  startedAtMs: number;
  torrentHash: string | null;
  /**
   * Distinguishes a "Stream" action (auto-navigate to the player once indexed)
   * from a "Download" action (just index in the background for the library).
   * Older persisted entries that lack this field are treated as 'stream' to
   * preserve previous behavior.
   */
  intent: 'stream' | 'background';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadPendingRemoteStreamTarget(): PendingLocalStreamTarget | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      PENDING_REMOTE_STREAM_TARGET_STORAGE_KEY,
    );
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) {
      return null;
    }

    const remoteMediaId =
      typeof parsed.remoteMediaId === 'string' ? parsed.remoteMediaId.trim() : '';
    const sourceResultId =
      typeof parsed.sourceResultId === 'string' ? parsed.sourceResultId.trim() : '';
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const normalizedTitle =
      typeof parsed.normalizedTitle === 'string'
        ? parsed.normalizedTitle.trim()
        : '';
    const releaseYear =
      typeof parsed.releaseYear === 'number' && Number.isFinite(parsed.releaseYear)
        ? Math.floor(parsed.releaseYear)
        : null;
    const type =
      parsed.type === 'movie' || parsed.type === 'show' || parsed.type === 'other'
        ? parsed.type
        : null;
    const startedAtMs =
      typeof parsed.startedAtMs === 'number' && Number.isFinite(parsed.startedAtMs)
        ? parsed.startedAtMs
        : NaN;

    if (!remoteMediaId || !sourceResultId || !title || !type) {
      return null;
    }

    if (!Number.isFinite(startedAtMs)) {
      return null;
    }

    const ageMs = Date.now() - startedAtMs;
    if (ageMs > 24 * 60 * 60 * 1000) {
      return null;
    }

    return {
      remoteMediaId,
      sourceResultId,
      title,
      normalizedTitle: normalizedTitle || normalizeTitleKey(title),
      releaseYear,
      type,
      startedAtMs,
      torrentHash:
        typeof parsed.torrentHash === 'string' && parsed.torrentHash.trim()
          ? parsed.torrentHash.trim()
          : null,
      intent: parsed.intent === 'background' ? 'background' : 'stream',
    };
  } catch {
    return null;
  }
}

export function persistPendingRemoteStreamTarget(
  value: PendingLocalStreamTarget | null,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!value) {
      window.localStorage.removeItem(PENDING_REMOTE_STREAM_TARGET_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      PENDING_REMOTE_STREAM_TARGET_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function findIndexedLocalMatch(
  items: MediaItem[],
  target: PendingLocalStreamTarget,
): MediaItem | null {
  const expectedNormalized = normalizeTitleKey(
    target.normalizedTitle || target.title,
  );
  if (!expectedNormalized) {
    return null;
  }

  const candidates = items
    .filter((item) => !item.isRemote)
    .filter((item) => {
      const itemNormalized = normalizeTitleKey(
        item.normalizedTitle?.trim() || item.title,
      );
      return itemNormalized === expectedNormalized;
    });

  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((item) => {
    let score = 0;

    if (item.type === target.type) {
      score += 20;
    }

    if (target.releaseYear !== null && item.releaseYear !== null) {
      if (item.releaseYear === target.releaseYear) {
        score += 40;
      } else if (Math.abs(item.releaseYear - target.releaseYear) === 1) {
        score += 15;
      }
    }

    if (item.durationSeconds > 0) {
      score += 5;
    }

    return { item, score };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.item.type === 'show' && right.item.type === 'show') {
      const seasonDelta = (left.item.seasonNumber ?? 0) - (right.item.seasonNumber ?? 0);
      if (seasonDelta !== 0) {
        return seasonDelta;
      }

      const episodeDelta = (left.item.episodeNumber ?? 0) - (right.item.episodeNumber ?? 0);
      if (episodeDelta !== 0) {
        return episodeDelta;
      }
    }

    const leftUpdatedAt = Date.parse(left.item.updatedAt || '');
    const rightUpdatedAt = Date.parse(right.item.updatedAt || '');
    if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt)) {
      return rightUpdatedAt - leftUpdatedAt;
    }

    return right.item.sizeBytes - left.item.sizeBytes;
  });

  return scored[0]?.item ?? null;
}
