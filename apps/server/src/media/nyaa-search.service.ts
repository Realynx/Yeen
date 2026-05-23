import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { type CheerioAPI, load } from 'cheerio';
import type {
  IptorrentsDownloadedTorrent,
  IptorrentsSearchItem,
  IptorrentsSearchResponse,
} from './iptorrents-search.service';
import { MetadataApiCacheStore } from './metadata-api-cache.store';

const NYAA_BASE_URL = 'https://nyaa.si';
const DEFAULT_NYAA_TIMEOUT_MS = 12000;
const NYAA_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const NYAA_CACHE_PROVIDER = 'nyaa.search';
const MAX_RESULTS = 40;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_CATEGORY = '0_0';
const MAX_PAGE = 500;
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const NYAA_ALLOWED_CATEGORIES = [
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

const DEFAULT_SORT_FIELD: NyaaSortField = 'seeders';
const DEFAULT_SORT_DIRECTION: NyaaSortDirection = 'desc';

const NYAA_SORT_FIELD_PARAM_MAP: Record<NyaaSortField, string> = {
  size: 'size',
  seeders: 'seeders',
  leechers: 'leechers',
};

export interface NyaaSearchInput {
  query: string;
  category?: string;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortDirection?: string;
}

export interface NyaaSearchResponse extends IptorrentsSearchResponse {
  category: NyaaCategory;
  page: number;
  hasMore: boolean;
  sortBy: NyaaSortField;
  sortDirection: NyaaSortDirection;
}

interface NyaaCachedSearchPayload {
  sourceUrl: string;
  total: number;
  hasMore: boolean;
  results: IptorrentsSearchItem[];
}

@Injectable()
export class NyaaSearchService {
  private readonly logger = new Logger(NyaaSearchService.name);
  private readonly inFlightSearches = new Map<
    string,
    Promise<NyaaCachedSearchPayload>
  >();
  private readonly allowedCategories = new Set<string>(NYAA_ALLOWED_CATEGORIES);

  constructor(private readonly metadataApiCacheStore: MetadataApiCacheStore) {}

  async search(input: NyaaSearchInput): Promise<NyaaSearchResponse> {
    const cleanedQuery = input.query.trim();
    const normalizedCategory = this.normalizeCategory(input.category);
    const normalizedPage = this.normalizePage(input.page);
    const normalizedSortBy = this.normalizeSortField(input.sortBy);
    const normalizedSortDirection = this.normalizeSortDirection(
      input.sortDirection,
    );
    const normalizedLimit = this.normalizeLimit(input.limit);
    const sourceUrl = this.buildSearchUrl(
      cleanedQuery,
      normalizedCategory,
      normalizedPage,
      normalizedSortBy,
      normalizedSortDirection,
    );

    if (cleanedQuery.length < MIN_QUERY_LENGTH) {
      return {
        query: cleanedQuery,
        mediaType: 'all',
        category: normalizedCategory,
        page: normalizedPage,
        hasMore: false,
        sortBy: normalizedSortBy,
        sortDirection: normalizedSortDirection,
        sourceUrl,
        total: 0,
        results: [],
      };
    }

    const searchKey = this.searchCacheKey(
      cleanedQuery,
      normalizedCategory,
      normalizedPage,
      normalizedSortBy,
      normalizedSortDirection,
    );
    let payload = await this.metadataApiCacheStore.get<NyaaCachedSearchPayload>(
      NYAA_CACHE_PROVIDER,
      searchKey,
      {
        maxAgeMs: NYAA_SEARCH_CACHE_TTL_MS,
      },
    );

    if (!payload) {
      payload = await this.fetchAndCacheSearchPayload(
        searchKey,
        cleanedQuery,
        normalizedCategory,
        normalizedPage,
        normalizedSortBy,
        normalizedSortDirection,
      );
    }

    return {
      query: cleanedQuery,
      mediaType: 'all',
      category: normalizedCategory,
      page: normalizedPage,
      hasMore: payload.hasMore,
      sortBy: normalizedSortBy,
      sortDirection: normalizedSortDirection,
      sourceUrl: payload.sourceUrl || sourceUrl,
      total: payload.total,
      results: payload.results.slice(0, normalizedLimit),
    };
  }

  async downloadTorrentFile(input: {
    downloadUrl: string;
    fallbackFileName?: string;
  }): Promise<IptorrentsDownloadedTorrent> {
    const normalizedDownloadUrl = this.normalizeDownloadUrl(input.downloadUrl);
    const response = await this.send(
      normalizedDownloadUrl,
      DEFAULT_NYAA_TIMEOUT_MS,
    );
    const contentType =
      response.headers.get('content-type')?.toLowerCase() ?? '';

    if (!response.ok) {
      const snippet =
        (await response.text()).trim().slice(0, 160) ||
        'No response body returned.';
      throw new BadGatewayException(
        `Nyaa download failed (${response.status}): ${snippet}`,
      );
    }

    if (contentType.includes('text/html')) {
      throw new BadGatewayException(
        'Nyaa did not return a torrent file for this download URL.',
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new BadGatewayException('Nyaa returned an empty torrent file.');
    }

    return {
      buffer,
      originalname: this.resolveTorrentFileName(
        response,
        normalizedDownloadUrl,
        input.fallbackFileName,
      ),
    };
  }

  private async fetchAndCacheSearchPayload(
    searchKey: string,
    query: string,
    category: NyaaCategory,
    page: number,
    sortBy: NyaaSortField,
    sortDirection: NyaaSortDirection,
  ): Promise<NyaaCachedSearchPayload> {
    const inFlight = this.inFlightSearches.get(searchKey);
    if (inFlight) {
      return inFlight;
    }

    const task = this.loadSearchPayload(
      query,
      category,
      page,
      sortBy,
      sortDirection,
    )
      .then(async (payload) => {
        await this.metadataApiCacheStore.set(
          NYAA_CACHE_PROVIDER,
          searchKey,
          payload,
        );
        return payload;
      })
      .finally(() => {
        this.inFlightSearches.delete(searchKey);
      });

    this.inFlightSearches.set(searchKey, task);
    return task;
  }

  private async loadSearchPayload(
    query: string,
    category: NyaaCategory,
    page: number,
    sortBy: NyaaSortField,
    sortDirection: NyaaSortDirection,
  ): Promise<NyaaCachedSearchPayload> {
    const sourceUrl = this.buildSearchUrl(
      query,
      category,
      page,
      sortBy,
      sortDirection,
    );
    const html = await this.fetchSearchPage(sourceUrl, DEFAULT_NYAA_TIMEOUT_MS);
    const parsed = this.parseSearchPage(html, page);

    return {
      sourceUrl,
      total: parsed.total,
      hasMore: parsed.hasMore,
      results: parsed.results,
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      return 20;
    }

    return Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
  }

  private normalizeCategory(category: string | undefined): NyaaCategory {
    if (typeof category === 'undefined') {
      return DEFAULT_CATEGORY;
    }

    const cleaned = category.trim();
    if (this.allowedCategories.has(cleaned)) {
      return cleaned as NyaaCategory;
    }

    throw new BadRequestException(
      'Invalid Nyaa category. Use the c query value format from Nyaa (for example 1_0).',
    );
  }

  private normalizePage(page: number | undefined): number {
    if (typeof page !== 'number' || !Number.isFinite(page)) {
      return 1;
    }

    return Math.max(1, Math.min(MAX_PAGE, Math.floor(page)));
  }

  private normalizeSortField(sortBy: string | undefined): NyaaSortField {
    if (sortBy === 'size' || sortBy === 'seeders' || sortBy === 'leechers') {
      return sortBy;
    }

    return DEFAULT_SORT_FIELD;
  }

  private normalizeSortDirection(
    sortDirection: string | undefined,
  ): NyaaSortDirection {
    if (sortDirection === 'asc' || sortDirection === 'desc') {
      return sortDirection;
    }

    return DEFAULT_SORT_DIRECTION;
  }

  private normalizeDownloadUrl(downloadUrl: string): string {
    const cleaned = downloadUrl.trim();
    if (!cleaned) {
      throw new BadRequestException('Nyaa download URL is required.');
    }

    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      throw new BadRequestException(
        'Nyaa download URL must be a valid absolute URL.',
      );
    }

    if (!this.isNyaaHost(parsed.hostname)) {
      throw new BadRequestException('Download URL must point to a Nyaa host.');
    }

    if (!/\/download\/\d+(?:\.torrent)?$/i.test(parsed.pathname)) {
      throw new BadRequestException(
        'Download URL must use the Nyaa download endpoint.',
      );
    }

    return parsed.toString();
  }

  private isNyaaHost(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    return normalized === 'nyaa.si' || normalized.endsWith('.nyaa.si');
  }

  private buildSearchUrl(
    query: string,
    category: NyaaCategory,
    page: number,
    sortBy: NyaaSortField,
    sortDirection: NyaaSortDirection,
  ): string {
    const url = new URL('/', NYAA_BASE_URL);
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

  private searchCacheKey(
    query: string,
    category: NyaaCategory,
    page: number,
    sortBy: NyaaSortField,
    sortDirection: NyaaSortDirection,
  ): string {
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');

    return `${normalizedQuery}::${category}::p${page}::${sortBy}::${sortDirection}`;
  }

  private resolveTorrentFileName(
    response: Response,
    sourceUrl: string,
    fallbackFileName?: string,
  ): string {
    const fromHeader = this.parseFileNameFromContentDisposition(
      response.headers.get('content-disposition'),
    );
    if (fromHeader) {
      return this.sanitizeTorrentFileName(fromHeader);
    }

    try {
      const finalUrl = new URL(response.url || sourceUrl);
      const pathTail = finalUrl.pathname.split('/').pop();
      if (pathTail) {
        return this.sanitizeTorrentFileName(decodeURIComponent(pathTail));
      }
    } catch {
      // Fall back to title-derived file names.
    }

    return this.sanitizeTorrentFileName(fallbackFileName || 'nyaa-download');
  }

  private parseFileNameFromContentDisposition(
    header: string | null,
  ): string | null {
    if (!header) {
      return null;
    }

    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      const encoded = utf8Match[1].trim().replace(/^"|"$/g, '');
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }

    const simpleMatch = header.match(/filename="?([^";]+)"?/i);
    return simpleMatch?.[1]?.trim() || null;
  }

  private sanitizeTorrentFileName(value: string): string {
    const withoutIllegalChars = value
      .replace(/[\\/:*?"<>|%]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .replace(/\.+$/, '');

    const withFallback = withoutIllegalChars || 'nyaa-download';
    const trimmed = withFallback.slice(0, 160);
    return trimmed.toLowerCase().endsWith('.torrent')
      ? trimmed
      : `${trimmed}.torrent`;
  }

  private async fetchSearchPage(
    searchUrl: string,
    timeoutMs: number,
  ): Promise<string> {
    const response = await this.send(searchUrl, timeoutMs);
    const html = await response.text();

    if (!response.ok) {
      const snippet = html.trim().slice(0, 160) || 'No response body returned.';
      throw new BadGatewayException(
        `Nyaa search failed (${response.status}): ${snippet}`,
      );
    }

    return html;
  }

  private async send(pathOrUrl: string, timeoutMs: number): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const requestUrl = pathOrUrl.startsWith('http')
        ? pathOrUrl
        : `${NYAA_BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
      const headers = new Headers();

      headers.set('User-Agent', CHROME_USER_AGENT);
      headers.set(
        'Accept',
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      );
      headers.set('Accept-Language', 'en-US,en;q=0.9');

      return await fetch(requestUrl, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new GatewayTimeoutException(
          `Nyaa request timed out after ${timeoutMs}ms.`,
        );
      }

      const message =
        error instanceof Error ? error.message : 'Unknown network error.';
      this.logger.warn(`Nyaa request failed: ${message}`);
      throw new BadGatewayException(`Failed to connect to Nyaa: ${message}`);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private parseSearchPage(
    html: string,
    currentPage: number,
  ): { results: IptorrentsSearchItem[]; total: number; hasMore: boolean } {
    const $ = load(html);
    const results = this.parseSearchResults($);

    const pageInfoText = this.cleanText($('body').text());
    const pageInfoMatch = pageInfoText.match(
      /Displaying\s+results\s+\d+\s*-\s*(\d+)\s+out\s+of\s+([\d,]+)\s+results/i,
    );

    let total = results.length;
    let hasMore = false;

    if (pageInfoMatch?.[1] && pageInfoMatch[2]) {
      const shownEnd = this.toInteger(pageInfoMatch[1]);
      const parsedTotal = this.toInteger(pageInfoMatch[2]);
      if (parsedTotal > 0) {
        total = Math.max(parsedTotal, results.length);
      }
      hasMore = shownEnd > 0 && shownEnd < total;
    }

    if (!hasMore) {
      hasMore = this.hasNextPageLink($, currentPage);
    }

    return {
      results,
      total: Math.max(total, results.length),
      hasMore,
    };
  }

  private parseSearchResults($: CheerioAPI): IptorrentsSearchItem[] {
    const rows = $('table.torrent-list tbody tr');
    const parsed: IptorrentsSearchItem[] = [];

    rows.each((index, row) => {
      const cells = $(row).children('td');
      if (cells.length < 8) {
        return;
      }

      const category = this.cleanText(
        cells.eq(0).find('img').first().attr('alt') ?? 'Unknown',
      );
      const nameCell = cells.eq(1);
      const titleLink = nameCell
        .find('a[href^="/view/"]')
        .not('.comments')
        .first();
      const title = this.cleanText(titleLink.text());
      if (!title) {
        return;
      }

      const detailsUrl = this.toAbsoluteUrl(titleLink.attr('href') ?? null);
      if (!detailsUrl) {
        return;
      }

      const downloadUrl = this.toAbsoluteUrl(
        cells.eq(2).find('a[href^="/download/"]').first().attr('href') ?? null,
      );
      const subtitleRaw = this.cleanText(titleLink.attr('title') ?? '');
      const subtitle =
        subtitleRaw && subtitleRaw !== title ? subtitleRaw : null;

      parsed.push({
        id: this.extractTorrentId(detailsUrl, index + 1),
        title,
        category,
        subtitle,
        size: this.cleanText(cells.eq(3).text()) || 'Unknown',
        snatches: this.toInteger(cells.eq(7).text()),
        seeders: this.toInteger(cells.eq(5).text()),
        leechers: this.toInteger(cells.eq(6).text()),
        comments: this.toInteger(nameCell.find('a.comments').first().text()),
        isFreeleech: false,
        isNew: false,
        detailsUrl,
        downloadUrl,
      });
    });

    return parsed;
  }

  private hasNextPageLink($: CheerioAPI, currentPage: number): boolean {
    const nextPage = currentPage + 1;

    return $('ul.pagination a[href]')
      .toArray()
      .some((anchor) => {
        const href = $(anchor).attr('href');
        if (!href) {
          return false;
        }

        try {
          const parsed = new URL(href, NYAA_BASE_URL);
          const pageParam = parsed.searchParams.get('p');
          const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
          return Number.isFinite(page) && page >= nextPage;
        } catch {
          return false;
        }
      });
  }

  private toAbsoluteUrl(input: string | null): string | null {
    if (!input) {
      return null;
    }

    try {
      return new URL(input, NYAA_BASE_URL).toString();
    } catch {
      return null;
    }
  }

  private extractTorrentId(detailsUrl: string, fallbackIndex: number): string {
    const match = detailsUrl.match(/\/view\/(\d+)/i);
    return match?.[1] ?? `nyaa-${fallbackIndex}`;
  }

  private cleanText(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
  }

  private toInteger(input: string): number {
    const digits = input.replace(/[^0-9]/g, '');
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isAbortError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return (
        error.name === 'AbortError' ||
        error.message.toLowerCase().includes('aborted')
      );
    }

    return error instanceof Error && error.name === 'AbortError';
  }
}
