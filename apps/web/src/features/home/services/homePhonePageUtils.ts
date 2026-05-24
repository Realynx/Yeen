import type { MediaItem } from '../../shared/services/types';
import {
  MAX_TAG_ROW_ITEMS,
  normalizeHomeMovieTagKey,
  normalizeTags,
  seededHash,
  shouldReplaceTagRowRepresentative,
  toHomeMovieTagLabel,
  toRandomizedItems,
  toTagRowMediaKey,
} from './homePageUtils';

export const PHONE_TAG_ROW_LIMIT = 6;
export const PHONE_MIN_TAG_ROW_ITEMS = 3;

export interface PhoneTaggedRow {
  key: string;
  label: string;
  items: MediaItem[];
}

export function isStandaloneDisplayMode(target: Window): boolean {
  const displayModeStandalone = target.matchMedia('(display-mode: standalone)').matches;
  const navigatorWithStandalone = target.navigator as Navigator & { standalone?: boolean };
  return displayModeStandalone || navigatorWithStandalone.standalone === true;
}

export function isLikelyPhoneDevice(target: Window): boolean {
  const userAgent = target.navigator.userAgent.toLowerCase();
  const isMobileAgent = /android|iphone|ipad|ipod|mobile/.test(userAgent);
  const coarsePointer = target.matchMedia('(pointer: coarse)').matches;
  return isMobileAgent || coarsePointer;
}

export function addMediaQueryChangeListener(query: MediaQueryList, listener: () => void) {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => {
      query.removeEventListener('change', listener);
    };
  }

  query.addListener(listener);
  return () => {
    query.removeListener(listener);
  };
}

export function buildPhoneTaggedRows(
  mediaItems: readonly MediaItem[],
  randomSeed: number,
): PhoneTaggedRow[] {
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
  const builtRows: PhoneTaggedRow[] = [];

  for (const row of orderedRows) {
    const randomizedItems = toRandomizedItems(
      [...row.itemByMediaKey.values()],
      seededHash(`${randomSeed}:tag:${row.key}`),
    );

    const rowItems: MediaItem[] = [];
    const rowMediaKeys = new Set<string>();
    for (const item of randomizedItems) {
      const mediaKey = toTagRowMediaKey(item);
      if (usedTagRowMediaKeys.has(mediaKey) || rowMediaKeys.has(mediaKey)) {
        continue;
      }

      rowMediaKeys.add(mediaKey);
      rowItems.push(item);

      if (rowItems.length >= MAX_TAG_ROW_ITEMS) {
        break;
      }
    }

    if (rowItems.length < PHONE_MIN_TAG_ROW_ITEMS) {
      continue;
    }

    for (const mediaKey of rowMediaKeys) {
      usedTagRowMediaKeys.add(mediaKey);
    }

    builtRows.push({
      key: row.key,
      label: row.label,
      items: rowItems,
    });

    if (builtRows.length >= PHONE_TAG_ROW_LIMIT) {
      break;
    }
  }

  return builtRows;
}
