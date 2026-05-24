import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaMetadataPatch } from './media-metadata-patch.types';

export type RemoteMediaProvider = 'tmdb' | 'jikan';

export interface RemoteSelectionRef {
  provider: RemoteMediaProvider;
  providerId: string;
}

export function resolveRemoteSelectionFromItem(
  item: MediaItem,
): RemoteSelectionRef | null {
  const remoteSourceId = normalizeOptionalString(item.remoteSourceId);

  if (
    (item.remoteSource !== 'tmdb' && item.remoteSource !== 'jikan') ||
    !remoteSourceId
  ) {
    return null;
  }

  return {
    provider: item.remoteSource,
    providerId: remoteSourceId,
  };
}

export function resolveRemoteSelectionAfterPatch(
  existing: MediaItem,
  patch: MediaMetadataPatch,
): RemoteSelectionRef | null {
  const nextSource = hasPatchKey(patch, 'remoteSource')
    ? (patch.remoteSource ?? null)
    : (existing.remoteSource ?? null);
  const nextId = hasPatchKey(patch, 'remoteSourceId')
    ? normalizeOptionalString(patch.remoteSourceId)
    : normalizeOptionalString(existing.remoteSourceId);

  if ((nextSource !== 'tmdb' && nextSource !== 'jikan') || !nextId) {
    return null;
  }

  return {
    provider: nextSource,
    providerId: nextId,
  };
}

export function remoteSelectionsEqual(
  left: RemoteSelectionRef | null,
  right: RemoteSelectionRef | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.provider === right.provider && left.providerId === right.providerId;
}

export function resolveMediaTypeHintAfterPatch(
  existing: MediaItem,
  patch: MediaMetadataPatch,
): 'movie' | 'show' | null {
  const patchedType = hasPatchKey(patch, 'type') ? patch.type : existing.type;

  if (patchedType === 'movie' || patchedType === 'show') {
    return patchedType;
  }

  return existing.type === 'movie' || existing.type === 'show'
    ? existing.type
    : null;
}

export function shouldHydrateDescriptionFromRemote(
  existing: MediaItem,
  patch: MediaMetadataPatch,
): boolean {
  if (!hasPatchKey(patch, 'description')) {
    return true;
  }

  if (typeof patch.description !== 'string') {
    return false;
  }

  const incomingDescription = patch.description.trim();
  if (!incomingDescription) {
    return true;
  }

  const existingDescription = normalizeOptionalString(existing.description) ?? '';
  return incomingDescription === existingDescription;
}

export function hasNonEmptyString(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function coercePositiveEpisodeNumber(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

function hasPatchKey<K extends keyof MediaMetadataPatch>(
  patch: MediaMetadataPatch,
  key: K,
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}
