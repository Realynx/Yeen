import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import {
  buildIptSearchCacheKey,
  buildIptSearchUrl,
  filterIptByMediaType,
  normalizeIptLimit,
} from './iptorrents-search-query.helpers';
import { parseIptSearchResults } from './iptorrents-search-parser.helpers';
import { extractCookieHeader } from './iptorrents-search-cookie.helpers';
import {
  normalizeIptDownloadUrl,
  resolveIptTorrentFileName,
} from './iptorrents-search-download.helpers';
import {
  isAbortError,
  looksLikeIptLoginPage,
} from './iptorrents-search-error.helpers';

const IPT_BASE_URL = 'https://iptorrents.com';
const DEFAULT_IPTORRENTS_TIMEOUT_MS = 15000;
const IPTORRENTS_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const MIN_QUERY_LENGTH = 2;
const IPTORRENTS_CACHE_PROVIDER = 'iptorrents.search';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export type IptorrentsMediaType = 'movie' | 'show';

export interface IptorrentsSearchInput {
  query: string;
  limit?: number;
  mediaType?: IptorrentsMediaType;
}

export interface IptorrentsSearchItem {
  id: string;
  title: string;
  category: string;
  subtitle: string | null;
  size: string;
  snatches: number;
  seeders: number;
  leechers: number;
  comments: number;
  isFreeleech: boolean;
  isNew: boolean;
  detailsUrl: string;
  downloadUrl: string | null;
}

export interface IptorrentsSearchResponse {
  query: string;
  mediaType: IptorrentsMediaType | 'all';
  sourceUrl: string;
  total: number;
  results: IptorrentsSearchItem[];
}

export interface IptorrentsDownloadedTorrent {
  buffer: Buffer;
  originalname: string;
}

interface IptConnectionSettings {
  username: string;
  password: string;
  timeoutMs: number;
}

interface IptorrentsCachedSearchPayload {
  sourceUrl: string;
  results: IptorrentsSearchItem[];
}

@Injectable()
export class IptorrentsSearchService {
  private readonly logger = new Logger(IptorrentsSearchService.name);
  private readonly inFlightSearches = new Map<
    string,
    Promise<IptorrentsCachedSearchPayload>
  >();

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly metadataApiCacheStore: MetadataApiCacheStore,
  ) {}

  async search(
    input: IptorrentsSearchInput,
  ): Promise<IptorrentsSearchResponse> {
    const cleanedQuery = input.query.trim();
    const normalizedLimit = normalizeIptLimit(input.limit);
    const sourceUrl = buildIptSearchUrl(IPT_BASE_URL, cleanedQuery);

    if (cleanedQuery.length < MIN_QUERY_LENGTH) {
      return {
        query: cleanedQuery,
        mediaType: input.mediaType ?? 'all',
        sourceUrl,
        total: 0,
        results: [],
      };
    }

    const searchKey = buildIptSearchCacheKey(cleanedQuery);
    let payload =
      await this.metadataApiCacheStore.get<IptorrentsCachedSearchPayload>(
        IPTORRENTS_CACHE_PROVIDER,
        searchKey,
        {
          maxAgeMs: IPTORRENTS_SEARCH_CACHE_TTL_MS,
        },
      );

    if (!payload) {
      payload = await this.fetchAndCacheSearchPayload(searchKey, cleanedQuery);
    }

    const filteredResults = filterIptByMediaType(
      payload.results,
      input.mediaType,
    );

    return {
      query: cleanedQuery,
      mediaType: input.mediaType ?? 'all',
      sourceUrl: payload.sourceUrl || sourceUrl,
      total: filteredResults.length,
      results: filteredResults.slice(0, normalizedLimit),
    };
  }

  async downloadTorrentFile(input: {
    downloadUrl: string;
    fallbackFileName?: string;
  }): Promise<IptorrentsDownloadedTorrent> {
    const normalizedDownloadUrl = normalizeIptDownloadUrl(input.downloadUrl);
    const settings = await this.getConnectionSettings();
    const cookieHeader = await this.login(settings);

    const response = await this.send(
      normalizedDownloadUrl,
      {
        method: 'GET',
        headers: {
          Referer: `${IPT_BASE_URL}/`,
          Accept: 'application/x-bittorrent,*/*;q=0.8',
        },
      },
      settings.timeoutMs,
      cookieHeader,
    );

    const contentType =
      response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!response.ok) {
      const snippet =
        (await response.text()).trim().slice(0, 160) ||
        'No response body returned.';
      throw new BadGatewayException(
        `IPTorrents download failed (${response.status}): ${snippet}`,
      );
    }

    if (contentType.includes('text/html')) {
      const html = await response.text();
      if (looksLikeIptLoginPage(html)) {
        throw new BadGatewayException(
          'IPTorrents download requires a valid authenticated session.',
        );
      }

      throw new BadGatewayException(
        'IPTorrents did not return a torrent file for this download URL.',
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new BadGatewayException(
        'IPTorrents returned an empty torrent file.',
      );
    }

    return {
      buffer,
      originalname: resolveIptTorrentFileName(
        response,
        normalizedDownloadUrl,
        input.fallbackFileName,
      ),
    };
  }

  private async fetchAndCacheSearchPayload(
    searchKey: string,
    query: string,
  ): Promise<IptorrentsCachedSearchPayload> {
    const inFlight = this.inFlightSearches.get(searchKey);
    if (inFlight) {
      return inFlight;
    }

    const task = this.loadSearchPayload(query)
      .then(async (payload) => {
        await this.metadataApiCacheStore.set(
          IPTORRENTS_CACHE_PROVIDER,
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
  ): Promise<IptorrentsCachedSearchPayload> {
    const sourceUrl = buildIptSearchUrl(IPT_BASE_URL, query);
    const settings = await this.getConnectionSettings();
    const cookieHeader = await this.login(settings);
    const html = await this.fetchSearchPage(
      sourceUrl,
      settings.timeoutMs,
      cookieHeader,
    );

    if (looksLikeIptLoginPage(html)) {
      throw new BadGatewayException(
        'IPTorrents login did not produce an authenticated session. Verify credentials in System Settings.',
      );
    }

    return {
      sourceUrl,
      results: parseIptSearchResults(html, IPT_BASE_URL),
    };
  }

  private async getConnectionSettings(): Promise<IptConnectionSettings> {
    const settings = await this.systemSettingsService.getSettings();
    const username = settings.iptorrentsUsername.trim();
    const password = settings.iptorrentsPassword.trim();

    if (!username) {
      throw new BadRequestException(
        'IPTorrents username is not configured in System Settings.',
      );
    }

    if (!password) {
      throw new BadRequestException(
        'IPTorrents password is not configured in System Settings.',
      );
    }

    return {
      username,
      password,
      timeoutMs: DEFAULT_IPTORRENTS_TIMEOUT_MS,
    };
  }

  private async login(settings: IptConnectionSettings): Promise<string> {
    const body = new URLSearchParams({
      username: settings.username,
      password: settings.password,
    });

    const response = await this.send(
      '/do-login.php',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: `${IPT_BASE_URL}/login.php`,
          Origin: IPT_BASE_URL,
        },
        body,
        redirect: 'manual',
      },
      settings.timeoutMs,
      null,
    );

    const cookieHeader = extractCookieHeader(response);
    if (!cookieHeader) {
      throw new BadGatewayException(
        'IPTorrents login failed. No session cookie was returned.',
      );
    }

    const hasUidCookie = /(^|;\s*)uid=/i.test(cookieHeader);
    const hasPassCookie = /(^|;\s*)pass=/i.test(cookieHeader);

    if (!hasUidCookie || !hasPassCookie) {
      throw new BadGatewayException(
        'IPTorrents login failed. Verify credentials in System Settings.',
      );
    }

    return cookieHeader;
  }

  private async fetchSearchPage(
    searchUrl: string,
    timeoutMs: number,
    cookieHeader: string,
  ): Promise<string> {
    const response = await this.send(
      searchUrl,
      {
        method: 'GET',
        headers: {
          Referer: `${IPT_BASE_URL}/`,
        },
      },
      timeoutMs,
      cookieHeader,
    );

    const html = await response.text();
    if (!response.ok) {
      const snippet = html.trim().slice(0, 160) || 'No response body returned.';
      throw new BadGatewayException(
        `IPTorrents search failed (${response.status}): ${snippet}`,
      );
    }

    return html;
  }

  private async send(
    pathOrUrl: string,
    init: RequestInit,
    timeoutMs: number,
    cookieHeader: string | null,
  ): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const requestUrl = pathOrUrl.startsWith('http')
        ? pathOrUrl
        : `${IPT_BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
      const headers = new Headers(init.headers ?? {});

      headers.set('User-Agent', CHROME_USER_AGENT);
      if (!headers.has('Accept')) {
        headers.set(
          'Accept',
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        );
      }
      if (!headers.has('Accept-Language')) {
        headers.set('Accept-Language', 'en-US,en;q=0.9');
      }

      if (cookieHeader) {
        headers.set('Cookie', cookieHeader);
      }

      return await fetch(requestUrl, {
        ...init,
        headers,
        signal: abortController.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new GatewayTimeoutException(
          `IPTorrents request timed out after ${timeoutMs}ms.`,
        );
      }

      const message =
        error instanceof Error ? error.message : 'Unknown network error.';
      this.logger.warn(`IPTorrents request failed: ${message}`);
      throw new BadGatewayException(
        `Failed to connect to IPTorrents: ${message}`,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
