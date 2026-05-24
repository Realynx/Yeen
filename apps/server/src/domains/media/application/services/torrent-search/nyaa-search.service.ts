import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  IptorrentsDownloadedTorrent,
  IptorrentsSearchItem,
  IptorrentsSearchResponse,
} from './iptorrents-search.service';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import {
  NYAA_ALLOWED_CATEGORIES,
  type NyaaCategory,
  type NyaaSortDirection,
  type NyaaSortField,
  buildNyaaSearchCacheKey,
  buildNyaaSearchUrl,
  normalizeNyaaCategory,
  normalizeNyaaLimit,
  normalizeNyaaPage,
  normalizeNyaaSortDirection,
  normalizeNyaaSortField,
} from './nyaa-search-query.helpers';
import { parseNyaaSearchPage } from './nyaa-search-parser.helpers';
import {
  isNyaaHost,
  resolveNyaaTorrentFileName,
} from './nyaa-search-download.helpers';

const NYAA_BASE_URL = 'https://nyaa.si';
const DEFAULT_NYAA_TIMEOUT_MS = 12000;
const NYAA_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const NYAA_CACHE_PROVIDER = 'nyaa.search';
const MIN_QUERY_LENGTH = 2;
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export type { NyaaCategory, NyaaSortDirection, NyaaSortField };

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
    const normalizedCategory = normalizeNyaaCategory(
      input.category,
      this.allowedCategories,
    );
    const normalizedPage = normalizeNyaaPage(input.page);
    const normalizedSortBy = normalizeNyaaSortField(input.sortBy);
    const normalizedSortDirection = normalizeNyaaSortDirection(
      input.sortDirection,
    );
    const normalizedLimit = normalizeNyaaLimit(input.limit);
    const sourceUrl = buildNyaaSearchUrl(
      NYAA_BASE_URL,
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

    const searchKey = buildNyaaSearchCacheKey(
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
      originalname: resolveNyaaTorrentFileName(
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
    const sourceUrl = buildNyaaSearchUrl(
      NYAA_BASE_URL,
      query,
      category,
      page,
      sortBy,
      sortDirection,
    );
    const html = await this.fetchSearchPage(sourceUrl, DEFAULT_NYAA_TIMEOUT_MS);
    const parsed = parseNyaaSearchPage(html, page, NYAA_BASE_URL);

    return {
      sourceUrl,
      total: parsed.total,
      hasMore: parsed.hasMore,
      results: parsed.results,
    };
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

    if (!isNyaaHost(parsed.hostname)) {
      throw new BadRequestException('Download URL must point to a Nyaa host.');
    }

    if (!/\/download\/\d+(?:\.torrent)?$/i.test(parsed.pathname)) {
      throw new BadRequestException(
        'Download URL must use the Nyaa download endpoint.',
      );
    }

    return parsed.toString();
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
