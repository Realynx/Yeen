import {
  type IptorrentsMediaType,
  type IptorrentsSearchItem,
} from './iptorrents-search.service';

const MAX_RESULTS = 40;

export function normalizeIptLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
}

export function buildIptSearchUrl(baseUrl: string, query: string): string {
  const url = new URL('/t', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('qf', 'ti');
  return url.toString();
}

export function buildIptSearchCacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function filterIptByMediaType(
  items: IptorrentsSearchItem[],
  mediaType: IptorrentsMediaType | undefined,
): IptorrentsSearchItem[] {
  if (!mediaType) {
    return items;
  }

  if (mediaType === 'movie') {
    return items.filter((item) =>
      item.category.trim().toLowerCase().startsWith('movie'),
    );
  }

  return items.filter((item) =>
    item.category.trim().toLowerCase().startsWith('tv'),
  );
}
