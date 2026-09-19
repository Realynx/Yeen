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

interface TaggedRowAccumulator {
  key: string;
  label: string;
  itemByMediaKey: Map<string, MediaItem>;
}

function addTaggedItem(
  rows: Map<string, TaggedRowAccumulator>,
  tag: string,
  item: MediaItem,
): void {
  const key = normalizeHomeMovieTagKey(tag);
  const mediaKey = toTagRowMediaKey(item);
  const row = rows.get(key);
  if (!row) {
    rows.set(key, {
      key,
      label: toHomeMovieTagLabel(tag),
      itemByMediaKey: new Map([[mediaKey, item]]),
    });
    return;
  }

  const existingItem = row.itemByMediaKey.get(mediaKey);
  if (!existingItem || shouldReplaceTagRowRepresentative(existingItem, item)) {
    row.itemByMediaKey.set(mediaKey, item);
  }
}

function collectTaggedRows(mediaItems: MediaItem[]): TaggedRowAccumulator[] {
  const rows = new Map<string, TaggedRowAccumulator>();
  for (const item of mediaItems) {
    if (item.digitalMediaType === 'video') {
      normalizeTags(item.tags).forEach((tag) => addTaggedItem(rows, tag, item));
    }
  }

  return [...rows.values()].sort((left, right) =>
    right.itemByMediaKey.size - left.itemByMediaKey.size
    || left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
  );
}

function selectUnusedItems(
  row: TaggedRowAccumulator,
  randomRowSeed: number,
  usedMediaKeys: Set<string>,
  itemLimit: number,
): MediaItem[] {
  const items: MediaItem[] = [];
  const randomizedItems = toRandomizedItems(
    [...row.itemByMediaKey.values()],
    seededHash(`${randomRowSeed}:tag:${row.key}`),
  );
  for (const item of randomizedItems) {
    const mediaKey = toTagRowMediaKey(item);
    if (!usedMediaKeys.has(mediaKey)) {
      usedMediaKeys.add(mediaKey);
      items.push(item);
    }
    if (items.length >= itemLimit) break;
  }
  return items;
}

export function buildHomeTaggedMovieRows(
  mediaItems: MediaItem[],
  randomRowSeed: number,
  options?: {
    rowLimit?: number;
    itemLimit?: number;
    minItems?: number;
  },
): TaggedMovieRow[] {
  const usedTagRowMediaKeys = new Set<string>();
  const builtRows: TaggedMovieRow[] = [];
  const itemLimit = options?.itemLimit ?? MAX_TAG_ROW_ITEMS;
  const minItems = options?.minItems ?? MIN_TAG_ROW_ITEMS;

  for (const row of collectTaggedRows(mediaItems)) {
    const rowItems = selectUnusedItems(row, randomRowSeed, usedTagRowMediaKeys, itemLimit);

    if (rowItems.length < minItems) {
      continue;
    }

    builtRows.push({
      id: `row-tag-${toTagSlug(row.label)}`,
      label: row.label,
      items: rowItems,
    });

    if (options?.rowLimit && builtRows.length >= options.rowLimit) {
      break;
    }
  }

  return builtRows;
}
