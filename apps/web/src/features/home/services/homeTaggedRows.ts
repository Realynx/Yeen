import type { MediaItem } from '../../shared/services/types';
import {
  MAX_TAG_ROW_ITEMS,
  MIN_TAG_ROW_ITEMS,
  normalizeHomeMovieTagKey,
  normalizeTags,
  seededHash,
  shouldReplaceTagRowRepresentative,
  toHomeMovieTagLabel,
  toRandomizedItems,
  toTagRowMediaKey,
  toTagSlug,
  type TaggedMovieRow,
} from './homePageUtils';

export function buildHomeTaggedMovieRows(
  mediaItems: MediaItem[],
  randomRowSeed: number,
): TaggedMovieRow[] {
  const rows = new Map<
    string,
    {
      key: string;
      label: string;
      itemByMediaKey: Map<string, MediaItem>;
    }
  >();

  for (const item of mediaItems) {
    if (item.digitalMediaType !== 'video') {
      continue;
    }

    const tags = normalizeTags(item.tags);
    for (const tag of tags) {
      const key = normalizeHomeMovieTagKey(tag);
      const label = toHomeMovieTagLabel(tag);
      const mediaKey = toTagRowMediaKey(item);
      const existing = rows.get(key);

      if (!existing) {
        rows.set(key, {
          key,
          label,
          itemByMediaKey: new Map<string, MediaItem>([[mediaKey, item]]),
        });
        continue;
      }

      const existingItem = existing.itemByMediaKey.get(mediaKey);
      if (!existingItem) {
        existing.itemByMediaKey.set(mediaKey, item);
        continue;
      }

      if (shouldReplaceTagRowRepresentative(existingItem, item)) {
        existing.itemByMediaKey.set(mediaKey, item);
      }
    }
  }

  const orderedRows = [...rows.values()].sort((left, right) => {
    if (right.itemByMediaKey.size !== left.itemByMediaKey.size) {
      return right.itemByMediaKey.size - left.itemByMediaKey.size;
    }

    return left.label.localeCompare(right.label, undefined, {
      sensitivity: 'base',
    });
  });

  const usedTagRowMediaKeys = new Set<string>();
  const builtRows: TaggedMovieRow[] = [];

  for (const row of orderedRows) {
    const randomizedItems = toRandomizedItems(
      [...row.itemByMediaKey.values()],
      seededHash(`${randomRowSeed}:tag:${row.key}`),
    );

    const rowItems: MediaItem[] = [];
    for (const item of randomizedItems) {
      const mediaKey = toTagRowMediaKey(item);
      if (usedTagRowMediaKeys.has(mediaKey)) {
        continue;
      }

      usedTagRowMediaKeys.add(mediaKey);
      rowItems.push(item);

      if (rowItems.length >= MAX_TAG_ROW_ITEMS) {
        break;
      }
    }

    if (rowItems.length < MIN_TAG_ROW_ITEMS) {
      continue;
    }

    builtRows.push({
      id: `row-tag-${toTagSlug(row.label)}`,
      label: row.label,
      items: rowItems,
    });
  }

  return builtRows;
}
