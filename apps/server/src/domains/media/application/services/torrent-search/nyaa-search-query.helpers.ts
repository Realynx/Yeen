import { BadRequestException } from '@nestjs/common';

const MAX_RESULTS = 40;
const DEFAULT_CATEGORY = '0_0';
const MAX_PAGE = 500;
const DEFAULT_SORT_FIELD: NyaaSortField = 'seeders';
const DEFAULT_SORT_DIRECTION: NyaaSortDirection = 'desc';

const NYAA_SORT_FIELD_PARAM_MAP: Record<NyaaSortField, string> = {
  size: 'size',
  seeders: 'seeders',
  leechers: 'leechers',
};

export const NYAA_ALLOWED_CATEGORIES = [
  '0_0',
  '1_0',
  '1_1',
  '1_2',
  '1_3',
  '1_4',
  '2_0',
  '2_1',
  '2_2',
  '3_0',
  '3_1',
  '3_2',
  '3_3',
  '4_0',
  '4_1',
  '4_2',
  '4_3',
  '4_4',
  '5_0',
  '5_1',
  '5_2',
  '6_0',
  '6_1',
  '6_2',
] as const;

export type NyaaCategory = (typeof NYAA_ALLOWED_CATEGORIES)[number];
export type NyaaSortField = 'size' | 'seeders' | 'leechers';
export type NyaaSortDirection = 'desc' | 'asc';

export function normalizeNyaaLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
}

export function normalizeNyaaCategory(
  category: string | undefined,
  allowedCategories: Set<string>,
): NyaaCategory {
  if (typeof category === 'undefined') {
    return DEFAULT_CATEGORY;
  }

  const cleaned = category.trim();
  if (allowedCategories.has(cleaned)) {
    return cleaned as NyaaCategory;
  }

  throw new BadRequestException(
    'Invalid Nyaa category. Use the c query value format from Nyaa (for example 1_0).',
  );
}

export function normalizeNyaaPage(page: number | undefined): number {
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.min(MAX_PAGE, Math.floor(page)));
}

export function normalizeNyaaSortField(
  sortBy: string | undefined,
): NyaaSortField {
  if (sortBy === 'size' || sortBy === 'seeders' || sortBy === 'leechers') {
    return sortBy;
  }

  return DEFAULT_SORT_FIELD;
}

export function normalizeNyaaSortDirection(
  sortDirection: string | undefined,
): NyaaSortDirection {
  if (sortDirection === 'asc' || sortDirection === 'desc') {
    return sortDirection;
  }

  return DEFAULT_SORT_DIRECTION;
}

export function buildNyaaSearchUrl(
  baseUrl: string,
  query: string,
  category: NyaaCategory,
  page: number,
  sortBy: NyaaSortField,
  sortDirection: NyaaSortDirection,
): string {
  const url = new URL('/', baseUrl);
  url.searchParams.set('f', '0');
  url.searchParams.set('c', category);
  url.searchParams.set('q', query);
  if (page > 1) {
    url.searchParams.set('p', String(page));
  }
  url.searchParams.set('s', NYAA_SORT_FIELD_PARAM_MAP[sortBy]);
  url.searchParams.set('o', sortDirection);
  return url.toString();
}

export function buildNyaaSearchCacheKey(
  query: string,
  category: NyaaCategory,
  page: number,
  sortBy: NyaaSortField,
  sortDirection: NyaaSortDirection,
): string {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${normalizedQuery}::${category}::p${page}::${sortBy}::${sortDirection}`;
}
