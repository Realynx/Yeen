import type { TorrentListItem } from '../types/torrent.service.types';

export type TorrentOrderMode = 'sequential' | 'random';
export type TorrentAddIntent = 'stream' | 'background';

type TorrentOrderFlags = Pick<
  TorrentListItem,
  'sequentialDownload' | 'firstLastPiecePriority'
>;

export interface TorrentOrderTogglePlan {
  desiredSequential: boolean;
  desiredFirstLastPiecePriority: boolean;
  sequentialChanged: boolean;
  firstLastPiecePriorityChanged: boolean;
}

export function hasToggleableOrderFlags(
  torrent: TorrentOrderFlags | null,
): torrent is { sequentialDownload: boolean; firstLastPiecePriority: boolean } {
  return (
    Boolean(torrent) &&
    typeof torrent?.sequentialDownload === 'boolean' &&
    typeof torrent?.firstLastPiecePriority === 'boolean'
  );
}

export function buildTorrentOrderTogglePlan(input: {
  orderMode: TorrentOrderMode;
  sequentialDownload: boolean;
  firstLastPiecePriority: boolean;
}): TorrentOrderTogglePlan {
  const desiredSequential = input.orderMode === 'sequential';
  const desiredFirstLastPiecePriority = desiredSequential;

  return {
    desiredSequential,
    desiredFirstLastPiecePriority,
    sequentialChanged: input.sequentialDownload !== desiredSequential,
    firstLastPiecePriorityChanged:
      input.firstLastPiecePriority !== desiredFirstLastPiecePriority,
  };
}

export function isSequentialOrderEnforced(torrent: TorrentOrderFlags): boolean {
  return (
    torrent.sequentialDownload === true &&
    torrent.firstLastPiecePriority === true
  );
}

export function buildTorrentOrderModeMessage(
  orderMode: TorrentOrderMode,
): string {
  return orderMode === 'sequential'
    ? 'Torrent switched to sequential piece order.'
    : 'Torrent switched to random piece order.';
}

export function resolveTorrentOrderModeFromRequest(input: {
  orderMode?: TorrentOrderMode | null;
  intent?: TorrentAddIntent | null;
}): TorrentOrderMode | null {
  if (input.orderMode) {
    return input.orderMode;
  }

  if (input.intent === 'stream') {
    return 'sequential';
  }

  if (input.intent === 'background') {
    return 'random';
  }

  return null;
}
