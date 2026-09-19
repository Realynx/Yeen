import type { MediaItem } from '../../shared/services/types';

function normalizedTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasMatchingCatalogIdentity(remote: MediaItem, local: MediaItem): boolean {
  return Boolean(
    remote.remoteSource
      && remote.remoteSourceId
      && remote.remoteSource === local.remoteSource
      && remote.remoteSourceId === local.remoteSourceId,
  );
}

function hasMatchingTitleIdentity(remote: MediaItem, local: MediaItem): boolean {
  if (remote.type !== local.type || normalizedTitle(remote.title) !== normalizedTitle(local.title)) {
    return false;
  }

  return remote.releaseYear === local.releaseYear
    || remote.releaseYear === null
    || local.releaseYear === null;
}

export function findRemoteLibraryMatch(
  remote: MediaItem,
  localItems: readonly MediaItem[],
): MediaItem | null {
  if (!remote.isRemote) return null;

  return localItems.find((local) => hasMatchingCatalogIdentity(remote, local))
    ?? localItems.find((local) => hasMatchingTitleIdentity(remote, local))
    ?? null;
}
