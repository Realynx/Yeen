import type {
  SearchResultItem,
  TorrentTrackerId,
} from './torrentSearchTypes';

interface CachedBestTorrentEntry {
  tracker: TorrentTrackerId;
  mediaId: string;
  titleKey: string;
  cachedAt: number;
  item: SearchResultItem;
}

const BEST_TORRENT_CACHE_STORAGE_KEY = 'yeen.bestSeededTorrent.v1';
const BEST_TORRENT_CACHE_TTL_MS = 6 * 60 * 60_000;
const BEST_TORRENT_CACHE_MAX_ENTRIES = 120;

function buildBestTorrentCacheKey(
  tracker: TorrentTrackerId,
  mediaId: string,
  titleKey: string,
): string {
  return `${tracker}::${mediaId}::${titleKey}`;
}

function readBestTorrentCache(): Record<string, CachedBestTorrentEntry> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BEST_TORRENT_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, CachedBestTorrentEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBestTorrentCache(cache: Record<string, CachedBestTorrentEntry>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(BEST_TORRENT_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}

export function loadCachedBestTorrent(
  tracker: TorrentTrackerId,
  mediaId: string,
  titleKey: string,
): SearchResultItem | null {
  const cache = readBestTorrentCache();
  const key = buildBestTorrentCacheKey(tracker, mediaId, titleKey);
  const entry = cache[key];
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > BEST_TORRENT_CACHE_TTL_MS) {
    delete cache[key];
    writeBestTorrentCache(cache);
    return null;
  }

  if (!entry.item.downloadUrl) {
    return null;
  }

  return entry.item;
}

export function saveCachedBestTorrent(
  tracker: TorrentTrackerId,
  mediaId: string,
  titleKey: string,
  item: SearchResultItem,
) {
  const cache = readBestTorrentCache();
  const key = buildBestTorrentCacheKey(tracker, mediaId, titleKey);
  cache[key] = {
    tracker,
    mediaId,
    titleKey,
    cachedAt: Date.now(),
    item,
  };

  const entries = Object.entries(cache).sort(
    (left, right) => right[1].cachedAt - left[1].cachedAt,
  );
  if (entries.length > BEST_TORRENT_CACHE_MAX_ENTRIES) {
    for (const [entryKey] of entries.slice(BEST_TORRENT_CACHE_MAX_ENTRIES)) {
      delete cache[entryKey];
    }
  }

  writeBestTorrentCache(cache);
}
