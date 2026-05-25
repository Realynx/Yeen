import type { TorrentListItem } from '../../../torrent/application/services/torrent.service';
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

export function isActiveDownloadValue(item: TorrentListItem): boolean {
  const normalizedState = item.state.trim().toLowerCase();
  if (!normalizedState) {
    return false;
  }

  if (
    normalizedState.includes('pausedup') ||
    normalizedState.includes('upload') ||
    normalizedState.includes('error') ||
    normalizedState.includes('missing')
  ) {
    return false;
  }

  if (item.progress >= 1) {
    return false;
  }

  return (
    normalizedState.includes('download') ||
    normalizedState.includes('queue') ||
    normalizedState.includes('stall') ||
    normalizedState.includes('check') ||
    normalizedState.includes('meta')
  );
}
