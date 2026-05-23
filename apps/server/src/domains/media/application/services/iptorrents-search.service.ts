import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { load } from 'cheerio';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';

const IPT_BASE_URL = 'https://iptorrents.com';
const DEFAULT_IPTORRENTS_TIMEOUT_MS = 15000;
const IPTORRENTS_SEARCH_CACHE_TTL_MS = 5 * 60_000;
const MAX_RESULTS = 40;
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
    const normalizedLimit = this.normalizeLimit(input.limit);
    const sourceUrl = this.buildSearchUrl(cleanedQuery);

    if (cleanedQuery.length < MIN_QUERY_LENGTH) {
      return {
        query: cleanedQuery,
        mediaType: input.mediaType ?? 'all',
        sourceUrl,
        total: 0,
        results: [],
      };
    }

    const searchKey = this.searchCacheKey(cleanedQuery);
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

    const filteredResults = this.filterByMediaType(
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
    const normalizedDownloadUrl = this.normalizeDownloadUrl(input.downloadUrl);
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
      if (this.looksLikeLoginPage(html)) {
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
    const sourceUrl = this.buildSearchUrl(query);
    const settings = await this.getConnectionSettings();
    const cookieHeader = await this.login(settings);
    const html = await this.fetchSearchPage(
      sourceUrl,
      settings.timeoutMs,
      cookieHeader,
    );

    if (this.looksLikeLoginPage(html)) {
      throw new BadGatewayException(
        'IPTorrents login did not produce an authenticated session. Verify credentials in System Settings.',
      );
    }

    return {
      sourceUrl,
      results: this.parseSearchResults(html),
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      return 20;
    }

    return Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
  }

  private buildSearchUrl(query: string): string {
    const url = new URL('/t', IPT_BASE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('qf', 'ti');
    return url.toString();
  }

  private searchCacheKey(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
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

    const cookieHeader = this.extractCookieHeader(response);
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
      if (this.isAbortError(error)) {
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

  private parseSearchResults(html: string): IptorrentsSearchItem[] {
    const $ = load(html);
    const rows = $('#torrents tbody tr');
    const parsed: IptorrentsSearchItem[] = [];

    rows.each((index, row) => {
      const cells = $(row).children('td');
      if (cells.length < 9) {
        return;
      }

      const category = this.cleanText(
        cells.eq(0).find('img').first().attr('alt') ?? 'Unknown',
      );
      const nameCell = cells.eq(1);
      const titleLink = nameCell.find('a.hv').first();
      const title = this.cleanText(titleLink.text());
      if (!title) {
        return;
      }

      const detailsUrl = this.toAbsoluteUrl(titleLink.attr('href') ?? null);
      if (!detailsUrl) {
        return;
      }

      const torrentId = this.extractTorrentId(detailsUrl, index + 1);
      const downloadUrl = this.toAbsoluteUrl(
        cells.eq(3).find('a[href*="download.php"]').first().attr('href') ??
          null,
      );
      const subtitleText = this.cleanText(nameCell.find('.sub').first().text());
      const badgeTexts = nameCell
        .find('span')
        .toArray()
        .map((element) => this.cleanText($(element).text()).toLowerCase());

      parsed.push({
        id: torrentId,
        title,
        category,
        subtitle: subtitleText || null,
        size: this.cleanText(cells.eq(5).text()) || 'Unknown',
        snatches: this.toInteger(cells.eq(6).text()),
        seeders: this.toInteger(cells.eq(7).text()),
        leechers: this.toInteger(cells.eq(8).text()),
        comments: this.toInteger(cells.eq(4).text()),
        isFreeleech: badgeTexts.some((value) => value.includes('free')),
        isNew: badgeTexts.some((value) => value === 'new'),
        detailsUrl,
        downloadUrl,
      });
    });

    return parsed;
  }

  private filterByMediaType(
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

  private extractCookieHeader(response: Response): string {
    const setCookies = this.collectSetCookies(response);
    const cookiePairs = new Set<string>();

    for (const setCookie of setCookies) {
      const cookiePair = this.extractCookiePair(setCookie);
      if (cookiePair) {
        cookiePairs.add(cookiePair);
      }
    }

    return [...cookiePairs].join('; ');
  }

  private collectSetCookies(response: Response): string[] {
    const headersWithSetCookie = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const cookies =
      typeof headersWithSetCookie.getSetCookie === 'function'
        ? headersWithSetCookie.getSetCookie()
        : [];

    const combinedHeader = response.headers.get('set-cookie');
    if (combinedHeader) {
      cookies.push(...this.splitCombinedSetCookie(combinedHeader));
    }

    return cookies;
  }

  private splitCombinedSetCookie(combinedHeader: string): string[] {
    return combinedHeader
      .split(/,(?=[^;,\s]+=)/g)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private extractCookiePair(value: string): string | null {
    const firstPart = value.split(';', 1)[0]?.trim();
    if (!firstPart || !firstPart.includes('=')) {
      return null;
    }

    return firstPart;
  }

  private looksLikeLoginPage(html: string): boolean {
    return (
      /<form[^>]+action=["']?do-login\.php["']?/i.test(html) ||
      /<title>\s*iPT\s*[\u2013-]\s*Sign\s*In\s*<\/title>/i.test(html)
    );
  }

  private normalizeDownloadUrl(downloadUrl: string): string {
    const cleaned = downloadUrl.trim();
    if (!cleaned) {
      throw new BadRequestException('IPTorrents download URL is required.');
    }

    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      throw new BadRequestException(
        'IPTorrents download URL must be a valid absolute URL.',
      );
    }

    if (!this.isIptorrentsHost(parsed.hostname)) {
      throw new BadRequestException(
        'Download URL must point to an IPTorrents host.',
      );
    }

    if (!/\/download\.php(?:\/|$)/i.test(parsed.pathname)) {
      throw new BadRequestException(
        'Download URL must use the IPTorrents download endpoint.',
      );
    }

    return parsed.toString();
  }

  private isIptorrentsHost(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    return (
      normalized === 'iptorrents.com' || normalized.endsWith('.iptorrents.com')
    );
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

    return this.sanitizeTorrentFileName(
      fallbackFileName || 'iptorrents-download',
    );
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

    const withFallback = withoutIllegalChars || 'iptorrents-download';
    const trimmed = withFallback.slice(0, 160);
    return trimmed.toLowerCase().endsWith('.torrent')
      ? trimmed
      : `${trimmed}.torrent`;
  }

  private toAbsoluteUrl(input: string | null): string | null {
    if (!input) {
      return null;
    }

    try {
      return new URL(input, IPT_BASE_URL).toString();
    } catch {
      return null;
    }
  }

  private extractTorrentId(detailsUrl: string, fallbackIndex: number): string {
    const match = detailsUrl.match(/\/t\/(\d+)/i);
    return match?.[1] ?? `ipt-${fallbackIndex}`;
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
