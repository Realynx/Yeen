import type { MediaStore } from '../../infrastructure/stores/media.store';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import type { MediaLibraryType } from '@yeen/shared-contracts';

export interface MediaListOpsContext {
  mediaStore: MediaStore;
}

export async function listValue(
  context: MediaListOpsContext,
  search?: string,
  tags?: string[],
  libraryType?: MediaLibraryType,
): Promise<MediaItem[]> {
  const all = await context.mediaStore.all();
  const needle = search?.trim().toLowerCase() ?? '';
  const normalizedTags = normalizeTagFilters(tags);

  if (!needle && normalizedTags.length === 0 && !libraryType) {
    return all;
  }

  return all.filter((item) => {
    if (libraryType && item.libraryType !== libraryType) {
      return false;
    }

    const musicSearchFields = item.musicMetadata
      ? [
          item.musicMetadata.artist,
          item.musicMetadata.album,
          item.musicMetadata.albumArtist,
          item.musicMetadata.genre,
        ]
      : [];
    const matchesSearch =
      !needle ||
      item.title.toLowerCase().includes(needle) ||
      item.description?.toLowerCase().includes(needle) ||
      item.relativePath.toLowerCase().includes(needle) ||
      item.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
      musicSearchFields.some((value) => value?.toLowerCase().includes(needle));

    if (!matchesSearch) {
      return false;
    }

    if (normalizedTags.length === 0) {
      return true;
    }

    const itemTagSet = toNormalizedTagSet(item.tags);
    return normalizedTags.every((tag) => itemTagSet.has(tag));
  });
}

function normalizeTagFilters(tags?: string[]): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const normalized = new Set<string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') {
      continue;
    }

    const splitValues = rawTag.split(',');
    for (const splitValue of splitValues) {
      const cleaned = splitValue.trim().toLowerCase();
      if (cleaned) {
        normalized.add(cleaned);
      }
    }
  }

  return [...normalized];
}

function toNormalizedTagSet(
  tags: readonly string[] | null | undefined,
): Set<string> {
  const normalized = new Set<string>();

  if (!Array.isArray(tags) || tags.length === 0) {
    return normalized;
  }

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim().toLowerCase();
    if (cleaned) {
      normalized.add(cleaned);
    }
  }

  return normalized;
}
