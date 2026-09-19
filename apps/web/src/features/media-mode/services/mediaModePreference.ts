export type MediaMode = 'video' | 'music';

const STORAGE_PREFIX = 'yeen_media_mode';

export function mediaModeStorageKey(accountId: string): string {
  return `${STORAGE_PREFIX}:${accountId.trim() || 'anonymous'}`;
}

export function readMediaMode(accountId: string, storage?: Pick<Storage, 'getItem'>): MediaMode {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return 'video';
  }

  try {
    return targetStorage.getItem(mediaModeStorageKey(accountId)) === 'music'
      ? 'music'
      : 'video';
  } catch {
    return 'video';
  }
}

export function writeMediaMode(
  accountId: string,
  mode: MediaMode,
  storage?: Pick<Storage, 'setItem'>,
): void {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.setItem(mediaModeStorageKey(accountId), mode);
  } catch {
    // Preferences are optional when storage is unavailable or full.
  }
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
