import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';

interface QbConnectionSettings {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
}

interface QbRequestOptions {
  requiresAuth?: boolean;
  retryOnAuthFailure?: boolean;
}

export interface QbTorrentProperties {
  seq_dl?: boolean;
  f_l_piece_prio?: boolean;
  save_path?: string;
}

export interface QbTorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
}

export interface AddTorrentInput {
  magnetLink?: string;
  savePath?: string;
  paused: boolean;
  seedAfterDownload?: boolean;
  orderMode: 'sequential' | 'random';
  tags?: string;
  torrentFile?: {
    buffer: Buffer;
    fileName: string;
  };
}

@Injectable()
export class QbittorrentApiClient {
  private readonly logger = new Logger(QbittorrentApiClient.name);
  private sidCookie: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async listTorrents(filter?: {
    tag?: string;
    hashes?: string;
  }): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (filter?.tag) {
      params.set('tag', filter.tag);
    }
    if (filter?.hashes) {
      params.set('hashes', filter.hashes);
    }
    const query = params.toString();
    const path = query
      ? `/api/v2/torrents/info?${query}`
      : '/api/v2/torrents/info';
    const payload = await this.requestJson(path, { method: 'GET' });

    return Array.isArray(payload) ? payload : [];
  }

  async getTorrentFiles(hash: string): Promise<QbTorrentFile[]> {
    const payload = await this.requestJson(
      `/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`,
      { method: 'GET' },
    );

    if (!Array.isArray(payload)) {
      return [];
    }

    const files: QbTorrentFile[] = [];
    payload.forEach((raw, fallbackIndex) => {
      if (!this.isObject(raw)) {
        return;
      }
      const name = typeof raw.name === 'string' ? raw.name : '';
      if (!name) {
        return;
      }
      const size =
        typeof raw.size === 'number' && Number.isFinite(raw.size)
          ? raw.size
          : 0;
      const progress =
        typeof raw.progress === 'number' && Number.isFinite(raw.progress)
          ? Math.max(0, Math.min(1, raw.progress))
          : 0;
      const index =
        typeof raw.index === 'number' && Number.isFinite(raw.index)
          ? raw.index
          : fallbackIndex;
      files.push({ index, name, size, progress });
    });

    return files;
  }

  async addTorrent(input: AddTorrentInput): Promise<void> {
    const formData = new FormData();

    if (input.magnetLink) {
      formData.set('urls', input.magnetLink);
    }

    if (input.torrentFile) {
      const torrentBytes = Uint8Array.from(input.torrentFile.buffer);
      const fileBlob = new Blob([torrentBytes], {
        type: 'application/x-bittorrent',
      });
      formData.append('torrents', fileBlob, input.torrentFile.fileName);
    }

    if (input.savePath) {
      formData.set('savepath', input.savePath);
    }

    if (input.tags && input.tags.trim()) {
      formData.set('tags', input.tags.trim());
    }

    // Always create a per-torrent subfolder (qBittorrent v4.3+ contentLayout)
    // so single-file torrents land in their own directory named after the
    // torrent, matching how multi-file torrents are organized.
    formData.set('contentLayout', 'Subfolder');

    const sequential = input.orderMode === 'sequential';
    formData.set('paused', input.paused ? 'true' : 'false');
    formData.set('sequentialDownload', sequential ? 'true' : 'false');
    formData.set('firstLastPiecePrio', sequential ? 'true' : 'false');

    if (input.seedAfterDownload === false) {
      // Stop the torrent as soon as it completes instead of seeding.
      formData.set('ratioLimit', '0');
      formData.set('seedingTimeLimit', '0');
      formData.set('inactiveSeedingTimeLimit', '0');
    }

    await this.requestNoContent('/api/v2/torrents/add', {
      method: 'POST',
      body: formData,
    });
  }

  async startTorrent(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/start', hash);
  }

  async stopTorrent(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/stop', hash);
  }

  async deleteTorrent(hash: string, deleteFiles: boolean): Promise<void> {
    await this.requestNoContent('/api/v2/torrents/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: this.formBody({
        hashes: hash,
        deleteFiles: deleteFiles ? 'true' : 'false',
      }),
    });
  }

  async toggleSequentialDownload(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/toggleSequentialDownload', hash);
  }

  async toggleFirstLastPiecePriority(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/toggleFirstLastPiecePrio', hash);
  }

  async getTorrentProperties(hash: string): Promise<QbTorrentProperties> {
    const payload = await this.requestJson(
      `/api/v2/torrents/properties?hash=${encodeURIComponent(hash)}`,
      { method: 'GET' },
    );

    if (!this.isObject(payload)) {
      return {};
    }

    return {
      seq_dl: this.toOptionalBoolean(payload.seq_dl),
      f_l_piece_prio: this.toOptionalBoolean(payload.f_l_piece_prio),
      save_path:
        typeof payload.save_path === 'string' ? payload.save_path : undefined,
    };
  }

  private async postHashes(path: string, hash: string): Promise<void> {
    await this.requestNoContent(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: this.formBody({ hashes: hash }),
    });
  }

  private formBody(values: Record<string, string>): URLSearchParams {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      form.set(key, value);
    }
    return form;
  }

  private async requestNoContent(
    path: string,
    init: RequestInit,
    options?: QbRequestOptions,
  ): Promise<void> {
    await this.requestText(path, init, options);
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    options?: QbRequestOptions,
  ): Promise<unknown> {
    const text = await this.requestText(path, init, options);
    const trimmed = text.trim();

    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new BadGatewayException(
        `qBittorrent returned invalid JSON for ${path}.`,
      );
    }
  }

  private async requestText(
    path: string,
    init: RequestInit,
    options?: QbRequestOptions,
  ): Promise<string> {
    const requiresAuth = options?.requiresAuth ?? true;
    const retryOnAuthFailure = options?.retryOnAuthFailure ?? true;
    const settings = await this.getConnectionSettings();

    if (requiresAuth) {
      await this.ensureSession(settings);
    }

    const response = await this.send(
      settings,
      path,
      init,
      requiresAuth ? this.sidCookie : null,
    );

    if (response.status === 403 && requiresAuth && retryOnAuthFailure) {
      this.logger.warn('qBittorrent session expired. Re-authenticating.');
      this.sidCookie = null;
      await this.ensureSession(settings);
      return this.requestText(path, init, {
        ...options,
        retryOnAuthFailure: false,
      });
    }

    const responseText = await response.text();
    if (!response.ok) {
      const errorSnippet = responseText.trim().slice(0, 240);
      throw new BadGatewayException(
        `qBittorrent request failed (${response.status}): ${errorSnippet || 'No details returned.'}`,
      );
    }

    return responseText;
  }

  private async send(
    settings: QbConnectionSettings,
    path: string,
    init: RequestInit,
    cookie: string | null,
  ): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      settings.timeoutMs,
    );

    try {
      const headers = new Headers(init.headers ?? {});
      if (cookie) {
        headers.set('Cookie', cookie);
      }

      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return await fetch(`${settings.baseUrl}${normalizedPath}`, {
        ...init,
        headers,
        signal: abortController.signal,
      });
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new GatewayTimeoutException(
          `qBittorrent request timed out after ${settings.timeoutMs}ms.`,
        );
      }

      const message =
        error instanceof Error ? error.message : 'Unknown network error.';
      throw new BadGatewayException(
        `Failed to connect to qBittorrent at ${settings.baseUrl}: ${message}`,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async ensureSession(settings: QbConnectionSettings): Promise<void> {
    if (this.sidCookie) {
      return;
    }

    if (!this.loginPromise) {
      this.loginPromise = this.login(settings).finally(() => {
        this.loginPromise = null;
      });
    }

    await this.loginPromise;
  }

  private async login(settings: QbConnectionSettings): Promise<void> {
    const body = this.formBody({
      username: settings.username,
      password: settings.password,
    });

    const response = await this.send(
      settings,
      '/api/v2/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body,
      },
      null,
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `qBittorrent login failed (${response.status}).`,
      );
    }

    const sidCookie = this.extractSidCookie(response);
    if (!sidCookie || !responseText.trim().toLowerCase().includes('ok')) {
      throw new BadGatewayException(
        'qBittorrent login did not return a valid session.',
      );
    }

    this.sidCookie = sidCookie;
  }

  private async getConnectionSettings(): Promise<QbConnectionSettings> {
    const settings = await this.systemSettingsService.getSettings();

    const baseUrl = settings.qbittorrentBaseUrl.trim().replace(/\/+$/, '');
    const username = settings.qbittorrentUsername.trim();
    const password = settings.qbittorrentPassword.trim();

    if (!baseUrl) {
      throw new BadRequestException(
        'qBittorrent base URL is not configured in System Settings.',
      );
    }

    try {
      new URL(baseUrl);
    } catch {
      throw new BadRequestException(
        'qBittorrent base URL must be a valid absolute URL.',
      );
    }

    if (!username) {
      throw new BadRequestException(
        'qBittorrent username is not configured in System Settings.',
      );
    }

    if (!password) {
      throw new BadRequestException(
        'qBittorrent password is not configured in System Settings.',
      );
    }

    return {
      baseUrl,
      username,
      password,
      timeoutMs: settings.qbittorrentRequestTimeoutMs,
    };
  }

  private extractSidCookie(response: Response): string | null {
    const headersWithSetCookie = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const cookies =
      typeof headersWithSetCookie.getSetCookie === 'function'
        ? headersWithSetCookie.getSetCookie()
        : [];

    const singleSetCookie = response.headers.get('set-cookie');
    if (singleSetCookie) {
      cookies.push(singleSetCookie);
    }

    for (const cookie of cookies) {
      const match = cookie.match(/SID=([^;]+)/);
      if (match?.[1]) {
        return `SID=${match[1]}`;
      }
    }

    return null;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private isAbortError(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'AbortError' ||
        error.message.toLowerCase().includes('aborted'))
    );
  }
}
