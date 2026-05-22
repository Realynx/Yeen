import type { MediaItem } from '../lib/types';
import { toLibraryItems } from './mediaLibraryUtils';

export const LIBRARY_SEARCH_QUERY_PARAM = 'q';

export function normalizeLibrarySearchTerm(
  searchTerm: string | null | undefined,
): string {
  return searchTerm?.trim() ?? '';
}

export function toLibrarySearchPath(searchTerm: string): string {
  const normalizedSearchTerm = normalizeLibrarySearchTerm(searchTerm);

  if (!normalizedSearchTerm) {
    return '/library';
  }

  const params = new URLSearchParams();
  params.set(LIBRARY_SEARCH_QUERY_PARAM, normalizedSearchTerm);
  return `/library?${params.toString()}`;
}

export function toRandomDetailsCandidates(items: MediaItem[]): MediaItem[] {
  return toLibraryItems(items).filter(
    (item) => item.digitalMediaType === 'video' && !item.isRemote,
  );
}

export function pickRandomItem<T>(items: readonly T[]): T | null {
  if (items.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex] ?? null;
}
