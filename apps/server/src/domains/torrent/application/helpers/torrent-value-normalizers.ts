import type { TorrentMediaHint } from '../types/torrent.service.types';

export function normalizeTorrentHashInput(hash: string): string {
  return hash.trim().toLowerCase();
}

export function normalizeOptionalInfoHash(
  hash: string | null | undefined,
): string | null {
  if (typeof hash !== 'string') {
    return null;
  }

  const normalized = normalizeTorrentHashInput(hash);
  if (!normalized) {
    return null;
  }

  return /^[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
}

export function toNumberOrFallback(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function toOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 0) {
      return false;
    }

    if (value === 1) {
      return true;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

export function normalizeTorrentMediaHint(
  hint: Partial<TorrentMediaHint> | TorrentMediaHint | null | undefined,
): TorrentMediaHint | null {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) {
    return null;
  }

  const title = typeof hint.title === 'string' ? hint.title.trim() : '';
  if (!title) {
    return null;
  }

  const normalizedTitle =
    typeof hint.normalizedTitle === 'string'
      ? hint.normalizedTitle.trim() || title
      : title;
  const releaseYear =
    typeof hint.releaseYear === 'number' && Number.isFinite(hint.releaseYear)
      ? Math.floor(hint.releaseYear)
      : null;
  const mediaType =
    hint.mediaType === 'movie' ||
    hint.mediaType === 'show' ||
    hint.mediaType === 'other'
      ? hint.mediaType
      : null;
  const description =
    typeof hint.description === 'string'
      ? hint.description.trim() || null
      : null;
  const tags = Array.isArray(hint.tags)
    ? hint.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const posterUrl =
    typeof hint.posterUrl === 'string' ? hint.posterUrl.trim() || null : null;
  const backdropUrl =
    typeof hint.backdropUrl === 'string'
      ? hint.backdropUrl.trim() || null
      : null;
  const remoteSource =
    hint.remoteSource === 'tmdb' || hint.remoteSource === 'jikan'
      ? hint.remoteSource
      : null;
  const remoteSourceId =
    typeof hint.remoteSourceId === 'string'
      ? hint.remoteSourceId.trim() || null
      : null;

  return {
    title,
    normalizedTitle,
    releaseYear,
    mediaType,
    description,
    tags,
    posterUrl,
    backdropUrl,
    remoteSource,
    remoteSourceId,
  };
}
