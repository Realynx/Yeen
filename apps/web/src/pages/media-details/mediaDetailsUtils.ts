import {
  mediaBackdropImageUrl,
  mediaChapterThumbnailUrl,
  mediaPreviewImageUrl,
} from '../../lib/api';
import type { MediaItem, ProgressEntry } from '../../lib/types';

const stopWords = new Set([
  'the',
  'and',
  'with',
  'from',
  'into',
  'for',
  'part',
  'chapter',
  'movie',
  'film',
  'vs',
]);

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function qualityLabel(item: MediaItem): string {
  if (!item.height) {
    return 'SD';
  }

  if (item.height >= 2160) return '4K UHD';
  if (item.height >= 1440) return '1440p';
  if (item.height >= 1080) return 'FHD 1080p';
  if (item.height >= 720) return 'HD 720p';
  return `${item.height}p`;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeShowKey(item: MediaItem): string {
  const seeded = item.normalizedTitle?.trim();
  if (seeded) {
    return seeded;
  }

  return normalizeTitleKey(item.title)
    .replace(/\bs\d{1,2}e\d{1,3}\b/gi, '')
    .replace(/\b\d{1,2}x\d{1,3}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function franchiseTokens(title: string): Set<string> {
  const tokens = normalizeTitleKey(title)
    .split(' ')
    .filter((token) => token.length >= 3)
    .map((token) => (token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token))
    .filter((token) => !stopWords.has(token));

  return new Set(tokens);
}

export function areSeriesRelated(left: MediaItem, right: MediaItem): boolean {
  if (left.normalizedTitle && right.normalizedTitle && left.normalizedTitle === right.normalizedTitle) {
    return true;
  }

  const leftTokens = franchiseTokens(left.title);
  const rightTokens = franchiseTokens(right.title);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap >= 1;
}

export function previewImageUrl(item: MediaItem): string | null {
  if (item.previewImagePath?.startsWith('http://') || item.previewImagePath?.startsWith('https://')) {
    return item.previewImagePath;
  }

  if (item.previewImagePath) {
    return mediaPreviewImageUrl(item.id, item.metadataRefreshedAt || item.updatedAt);
  }

  return null;
}

export function backdropImageUrl(item: MediaItem): string | null {
  if (item.backdropImagePath?.startsWith('http://') || item.backdropImagePath?.startsWith('https://')) {
    return item.backdropImagePath;
  }

  if (item.backdropImagePath) {
    return mediaBackdropImageUrl(item.id, item.metadataRefreshedAt || item.updatedAt);
  }

  return previewImageUrl(item);
}

export function episodeDisplayTitle(item: MediaItem): string {
  const episodeTitle = item.episodeTitle?.trim();
  return episodeTitle || item.title;
}

export function episodeFrameImageUrl(item: MediaItem): string | null {
  if (item.chapterThumbnails.length > 0) {
    const representativeIndex = Math.floor(item.chapterThumbnails.length / 2);
    return mediaChapterThumbnailUrl(item.id, representativeIndex);
  }

  return previewImageUrl(item);
}

export function progressPercent(entry?: ProgressEntry | null): number {
  if (!entry) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, (entry.positionSeconds / Math.max(entry.durationSeconds, 1)) * 100),
  );
}

export function isResumableProgress(entry?: ProgressEntry | null): entry is ProgressEntry {
  return Boolean(entry && !entry.completed && entry.positionSeconds > 5);
}

export function playerHref(mediaId: string, entry?: ProgressEntry | null): string {
  if (isResumableProgress(entry)) {
    return `/player/${mediaId}?t=${Math.floor(entry.positionSeconds)}`;
  }

  return `/player/${mediaId}`;
}
