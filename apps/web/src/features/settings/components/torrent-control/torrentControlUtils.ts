import type { TorrentItem } from '../../../shared/services/types';

const TORRENT_STATE_LABELS: Record<string, string> = {
  error: 'Error',
  missingfiles: 'Missing Files',
  uploading: 'Seeding',
  pausedup: 'Seeding (Paused)',
  queuedup: 'Seeding (Queued)',
  stalledup: 'Seeding (Idle)',
  checkingup: 'Checking (Upload)',
  forcedup: 'Seeding (Forced)',
  allocating: 'Allocating',
  downloading: 'Downloading',
  metadl: 'Fetching Metadata',
  pauseddl: 'Downloading (Paused)',
  queueddl: 'Downloading (Queued)',
  stalleddl: 'Downloading (Stalled)',
  checkingdl: 'Checking (Download)',
  forceddl: 'Downloading (Forced)',
  checkingresumedata: 'Checking Resume Data',
  moving: 'Moving',
  unknown: 'Unknown',
};

export function formatTorrentState(state: string): string {
  const normalizedState = state.trim().toLowerCase();
  if (!normalizedState) {
    return TORRENT_STATE_LABELS.unknown;
  }

  return TORRENT_STATE_LABELS[normalizedState] ?? state;
}

export type TorrentStateCategoryKey =
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'queued'
  | 'checking'
  | 'moving'
  | 'error'
  | 'other';

export const TORRENT_STATE_CATEGORY_LABELS: Record<TorrentStateCategoryKey, string> = {
  downloading: 'Downloading',
  seeding: 'Seeding',
  paused: 'Paused',
  queued: 'Queued',
  checking: 'Checking',
  moving: 'Moving',
  error: 'Issues',
  other: 'Other',
};

export const TORRENT_STATE_CATEGORY_ORDER: TorrentStateCategoryKey[] = [
  'downloading',
  'seeding',
  'paused',
  'queued',
  'checking',
  'moving',
  'error',
  'other',
];

export function categorizeTorrentState(state: string): TorrentStateCategoryKey {
  const normalizedState = state.trim().toLowerCase();

  if (!normalizedState) {
    return 'other';
  }

  if (normalizedState === 'error' || normalizedState === 'missingfiles') {
    return 'error';
  }

  if (normalizedState === 'moving') {
    return 'moving';
  }

  if (normalizedState.startsWith('checking')) {
    return 'checking';
  }

  if (normalizedState.startsWith('queued')) {
    return 'queued';
  }

  if (
    normalizedState.startsWith('paused') ||
    normalizedState.includes('stopped')
  ) {
    return 'paused';
  }

  if (
    normalizedState === 'uploading' ||
    normalizedState === 'stalledup' ||
    normalizedState === 'forcedup'
  ) {
    return 'seeding';
  }

  if (
    normalizedState === 'downloading' ||
    normalizedState === 'metadl' ||
    normalizedState === 'stalleddl' ||
    normalizedState === 'forceddl' ||
    normalizedState === 'allocating'
  ) {
    return 'downloading';
  }

  if (normalizedState.endsWith('up')) {
    return 'seeding';
  }

  if (normalizedState.endsWith('dl')) {
    return 'downloading';
  }

  return 'other';
}

export interface TorrentStateCategoryGroup {
  key: TorrentStateCategoryKey;
  label: string;
  items: TorrentItem[];
}

export type TorrentControlActionIconName =
  | 'selectVisible'
  | 'clear'
  | 'start'
  | 'stop'
  | 'restart'
  | 'sequential'
  | 'random'
  | 'delete';
