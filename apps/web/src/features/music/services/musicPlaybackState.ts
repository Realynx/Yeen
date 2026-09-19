import type { ProgressEntry } from '../../shared/services/types';

const MUSIC_VOLUME_STORAGE_PREFIX = 'yeen_music_volume';
const DEFAULT_MUSIC_VOLUME = 0.8;

export interface MusicVolumePreference {
  accountId: string;
  volume: number;
}

interface MusicPlaybackToggleInput {
  hasCurrentTrack: boolean;
  audioPaused: boolean;
  trackCount: number;
}

export type MusicPlaybackToggleAction =
  | 'start-first'
  | 'play'
  | 'pause'
  | 'none';

export function musicPlaybackToggleAction(
  input: MusicPlaybackToggleInput,
): MusicPlaybackToggleAction {
  if (!input.hasCurrentTrack) {
    return input.trackCount > 0 ? 'start-first' : 'none';
  }

  return input.audioPaused ? 'play' : 'pause';
}

export function musicVolumeStorageKey(accountId: string): string {
  return `${MUSIC_VOLUME_STORAGE_PREFIX}:${normalizedAccountId(accountId)}`;
}

export function createMusicVolumePreference(
  accountId: string,
  storage?: Pick<Storage, 'getItem'>,
): MusicVolumePreference {
  return {
    accountId: normalizedAccountId(accountId),
    volume: readMusicVolume(accountId, storage),
  };
}

export function resolveMusicVolumePreference(
  accountId: string,
  preference: MusicVolumePreference,
  storage?: Pick<Storage, 'getItem'>,
): number {
  return preference.accountId === normalizedAccountId(accountId)
    ? preference.volume
    : readMusicVolume(accountId, storage);
}

export function readMusicVolume(
  accountId: string,
  storage?: Pick<Storage, 'getItem'>,
): number {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return DEFAULT_MUSIC_VOLUME;
  }

  try {
    const stored = targetStorage.getItem(musicVolumeStorageKey(accountId));
    if (stored === null) {
      return DEFAULT_MUSIC_VOLUME;
    }

    if (!stored.trim()) {
      return DEFAULT_MUSIC_VOLUME;
    }

    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : DEFAULT_MUSIC_VOLUME;
  } catch {
    return DEFAULT_MUSIC_VOLUME;
  }
}

export function writeMusicVolume(
  accountId: string,
  volume: number,
  storage?: Pick<Storage, 'setItem'>,
): void {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return;
  }

  const normalized = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
  try {
    targetStorage.setItem(musicVolumeStorageKey(accountId), String(normalized));
  } catch {
    // Music preferences remain optional if storage is unavailable or full.
  }
}

export function nextMusicProgressTimestamp(
  previousTimestampMs: number,
  nowMs: number,
): number {
  return Math.max(Math.floor(nowMs), Math.floor(previousTimestampMs) + 1);
}

export function resolveMusicResumePosition(
  progress: ProgressEntry | null | undefined,
): number {
  if (!progress || progress.completed || !Number.isFinite(progress.positionSeconds)) {
    return 0;
  }

  const position = Math.max(0, Math.floor(progress.positionSeconds));
  const duration = Number.isFinite(progress.durationSeconds)
    ? Math.max(0, Math.floor(progress.durationSeconds))
    : 0;
  return duration > 0 ? Math.min(position, duration) : position;
}

export function mergeMusicProgressEntry(
  current: ProgressEntry | undefined,
  incoming: ProgressEntry,
): ProgressEntry {
  if (!current) {
    return incoming;
  }

  return compareProgressFreshness(incoming, current) >= 0 ? incoming : current;
}

export class MusicProgressEntryCache {
  private identity = '';
  private readonly entries = new Map<string, ProgressEntry>();

  resetForIdentity(identity: string): void {
    if (identity === this.identity) {
      return;
    }

    this.identity = identity;
    this.entries.clear();
  }

  mergeForIdentity(identity: string, entry: ProgressEntry): boolean {
    if (identity !== this.identity) {
      return false;
    }

    this.entries.set(
      entry.mediaId,
      mergeMusicProgressEntry(this.entries.get(entry.mediaId), entry),
    );
    return true;
  }

  getForIdentity(identity: string, mediaId: string): ProgressEntry | undefined {
    return identity === this.identity ? this.entries.get(mediaId) : undefined;
  }
}

function compareProgressFreshness(
  left: ProgressEntry,
  right: ProgressEntry,
): number {
  const leftSync = normalizedTimestamp(left.syncTimestampMs);
  const rightSync = normalizedTimestamp(right.syncTimestampMs);
  if (leftSync !== rightSync) {
    return leftSync - rightSync;
  }

  return normalizedDate(left.updatedAt) - normalizedDate(right.updatedAt);
}

function normalizedTimestamp(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function normalizedDate(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedAccountId(accountId: string): string {
  return accountId.trim() || 'anonymous';
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
