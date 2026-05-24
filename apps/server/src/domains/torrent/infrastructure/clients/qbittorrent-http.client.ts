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

@Injectable()
export class QbittorrentHttpClient {
  private readonly logger = new Logger(QbittorrentHttpClient.name);
  private sidCookie: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async requestNoContent(
    path: string,
    init: RequestInit,
    options?: QbRequestOptions,
  ): Promise<void> {
    await this.requestText(path, init, options);
  }

  async requestJson(
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

  private formBody(values: Record<string, string>): URLSearchParams {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      form.set(key, value);
    }
    return form;
  }

  private isAbortError(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'AbortError' ||
        error.message.toLowerCase().includes('aborted'))
    );
  }
}
