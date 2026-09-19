import type { AdminMediaActivityItem } from './auth-admin-account.types';

export function toMediaActivityItemValue(
  entry: {
    mediaId: string;
    positionSeconds: number;
    durationSeconds: number;
    updatedAt: string;
  },
  mediaTitles: ReadonlyMap<string, string>,
): AdminMediaActivityItem {
  const title = mediaTitles.get(entry.mediaId) ?? entry.mediaId;
  const progressFraction =
    entry.durationSeconds > 0
      ? Math.max(0, Math.min(1, entry.positionSeconds / entry.durationSeconds))
      : 0;

  return {
    mediaId: entry.mediaId,
    title,
    updatedAt: entry.updatedAt,
    progressPercent: toProgressPercentValue(progressFraction),
  };
}

export function toProgressPercentValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value * 100)));
}
