import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdateSystemSettingsDto } from '../dto/update-system-settings.dto';
import {
  QbittorrentPathMapping,
  SystemSettings,
} from '../../domain/entities/system-settings.entity';
import { SystemSettingsStore } from '../../infrastructure/stores/system-settings.store';

const DEFAULT_MEDIA_METADATA_SQLITE_PATH = 'data/media-metadata.sqlite';
const DEFAULT_AI_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_AI_MODEL = 'llama3.1:8b';
const DEFAULT_QBITTORRENT_TIMEOUT_MS = 15000;

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly systemSettingsStore: SystemSettingsStore,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    const aiMetadataEnabledOverride = this.parseBooleanOverride(
      this.configService.get<string>('AI_METADATA_ENABLED'),
    );
    const persisted = await this.systemSettingsStore.get();
    const merged = {
      ...this.defaultsFromEnv(),
      ...persisted,
    } as Partial<SystemSettings>;

    if (typeof aiMetadataEnabledOverride === 'boolean') {
      merged.aiMetadataEnabled = aiMetadataEnabledOverride;
    }

    return this.normalize(merged);
  }

  async updateSettings(dto: UpdateSystemSettingsDto): Promise<SystemSettings> {
    const current = await this.getSettings();
    const merged = {
      ...current,
      ...dto,
    } as Partial<SystemSettings>;

    const normalized = this.normalize(merged);
    await this.systemSettingsStore.replace(normalized);

    return normalized;
  }

  private defaultsFromEnv(): SystemSettings {
    return {
      ffmpegPath:
        this.configService.get<string>('FFMPEG_PATH')?.trim() || 'ffmpeg',
      ffprobePath:
        this.configService.get<string>('FFPROBE_PATH')?.trim() || 'ffprobe',
      thumbnailCaptureCount: this.parseIntWithFallback(
        this.configService.get<string>('THUMBNAIL_CAPTURE_COUNT'),
        6,
      ),
      mediaMetadataSqlitePath:
        this.configService.get<string>('MEDIA_METADATA_SQLITE_PATH')?.trim() ||
        DEFAULT_MEDIA_METADATA_SQLITE_PATH,
      qbittorrentBaseUrl:
        this.configService.get<string>('QBITTORRENT_BASE_URL')?.trim() || '',
      qbittorrentUsername:
        this.configService.get<string>('QBITTORRENT_USERNAME')?.trim() || '',
      qbittorrentPassword:
        this.configService.get<string>('QBITTORRENT_PASSWORD')?.trim() || '',
      qbittorrentRequestTimeoutMs: this.parseIntWithFallback(
        this.configService.get<string>('QBITTORRENT_REQUEST_TIMEOUT_MS'),
        DEFAULT_QBITTORRENT_TIMEOUT_MS,
      ),
      qbittorrentDefaultOrderMode: this.normalizeQbittorrentOrderMode(
        this.configService.get<string>('QBITTORRENT_DEFAULT_ORDER_MODE'),
      ),
      qbittorrentPathMappings: this.parsePathMappingsFromEnv(
        this.configService.get<string>('QBITTORRENT_PATH_MAPPINGS'),
      ),
      iptorrentsUsername:
        this.configService.get<string>('IPTORRENTS_USERNAME')?.trim() || '',
      iptorrentsPassword:
        this.configService.get<string>('IPTORRENTS_PASSWORD')?.trim() || '',
      iptorrentsSeedingEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('IPTORRENTS_SEEDING_ENABLED'),
        true,
      ),
      nyaaSeedingEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('NYAA_SEEDING_ENABLED'),
        true,
      ),
      aiMetadataEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('AI_METADATA_ENABLED'),
        false,
      ),
      aiProvider: this.normalizeAiProvider(
        this.configService.get<string>('AI_PROVIDER'),
      ),
      aiModel:
        this.configService.get<string>('AI_MODEL')?.trim() || DEFAULT_AI_MODEL,
      aiOllamaBaseUrl:
        this.configService.get<string>('AI_OLLAMA_BASE_URL')?.trim() ||
        DEFAULT_AI_OLLAMA_BASE_URL,
      aiOpenAiApiKey:
        this.configService.get<string>('AI_OPENAI_API_KEY')?.trim() || '',
      aiDeduplicationEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('AI_DEDUPLICATION_ENABLED'),
        true,
      ),
      aiRequestTimeoutMs: this.parseIntWithFallback(
        this.configService.get<string>('AI_REQUEST_TIMEOUT_MS'),
        20000,
      ),
      tmdbApiKey: this.configService.get<string>('TMDB_API_KEY')?.trim() || '',
      openSubtitlesApiKey:
        this.configService.get<string>('OPENSUBTITLES_API_KEY')?.trim() || '',
      transcodePreset:
        this.configService.get<string>('TRANSCODE_PRESET')?.trim() ||
        'veryfast',
      transcodeCrf: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_CRF'),
        22,
      ),
      hlsSegmentSeconds: this.parseIntWithFallback(
        this.configService.get<string>('HLS_SEGMENT_SECONDS'),
        4,
      ),
      subtitleDefaultLanguage:
        this.configService.get<string>('SUBTITLE_DEFAULT_LANGUAGE')?.trim() ||
        'en',
    };
  }

  private normalize(input: Partial<SystemSettings>): SystemSettings {
    return {
      ffmpegPath: input.ffmpegPath?.trim() || 'ffmpeg',
      ffprobePath: input.ffprobePath?.trim() || 'ffprobe',
      thumbnailCaptureCount: this.clampInteger(
        input.thumbnailCaptureCount,
        1,
        30,
        6,
      ),
      mediaMetadataSqlitePath:
        input.mediaMetadataSqlitePath?.trim() ||
        DEFAULT_MEDIA_METADATA_SQLITE_PATH,
      qbittorrentBaseUrl: input.qbittorrentBaseUrl?.trim() || '',
      qbittorrentUsername: input.qbittorrentUsername?.trim() || '',
      qbittorrentPassword: input.qbittorrentPassword?.trim() || '',
      qbittorrentRequestTimeoutMs: this.clampInteger(
        input.qbittorrentRequestTimeoutMs,
        1000,
        120000,
        DEFAULT_QBITTORRENT_TIMEOUT_MS,
      ),
      qbittorrentDefaultOrderMode: this.normalizeQbittorrentOrderMode(
        input.qbittorrentDefaultOrderMode,
      ),
      qbittorrentPathMappings: this.normalizePathMappings(
        input.qbittorrentPathMappings,
      ),
      iptorrentsUsername: input.iptorrentsUsername?.trim() || '',
      iptorrentsPassword: input.iptorrentsPassword?.trim() || '',
      iptorrentsSeedingEnabled: this.normalizeBoolean(
        input.iptorrentsSeedingEnabled,
        true,
      ),
      nyaaSeedingEnabled: this.normalizeBoolean(input.nyaaSeedingEnabled, true),
      aiMetadataEnabled: this.normalizeBoolean(input.aiMetadataEnabled, false),
      aiProvider: this.normalizeAiProvider(input.aiProvider),
      aiModel: input.aiModel?.trim() || DEFAULT_AI_MODEL,
      aiOllamaBaseUrl:
        input.aiOllamaBaseUrl?.trim() || DEFAULT_AI_OLLAMA_BASE_URL,
      aiOpenAiApiKey: input.aiOpenAiApiKey?.trim() || '',
      aiDeduplicationEnabled: this.normalizeBoolean(
        input.aiDeduplicationEnabled,
        true,
      ),
      aiRequestTimeoutMs: this.clampInteger(
        input.aiRequestTimeoutMs,
        1000,
        120000,
        20000,
      ),
      tmdbApiKey: input.tmdbApiKey?.trim() || '',
      openSubtitlesApiKey: input.openSubtitlesApiKey?.trim() || '',
      transcodePreset: input.transcodePreset?.trim() || 'veryfast',
      transcodeCrf: this.clampInteger(input.transcodeCrf, 12, 40, 22),
      hlsSegmentSeconds: this.clampInteger(input.hlsSegmentSeconds, 1, 20, 4),
      subtitleDefaultLanguage: input.subtitleDefaultLanguage?.trim() || 'en',
    };
  }

  private parseIntWithFallback(
    value: string | undefined,
    fallback: number,
  ): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseBooleanWithFallback(
    value: string | undefined,
    fallback: boolean,
  ): boolean {
    if (!value) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private parseBooleanOverride(value: string | undefined): boolean | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return undefined;
  }

  private normalizeBoolean(
    value: boolean | undefined,
    fallback: boolean,
  ): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private normalizeAiProvider(value: string | undefined): 'ollama' | 'openai' {
    return value === 'openai' ? 'openai' : 'ollama';
  }

  private normalizeQbittorrentOrderMode(
    value: string | undefined,
  ): 'sequential' | 'random' {
    return value === 'sequential' ? 'sequential' : 'random';
  }

  private clampInteger(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    const rounded = Math.round(value);
    return Math.max(min, Math.min(max, rounded));
  }

  private normalizePathMappings(value: unknown): QbittorrentPathMapping[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const result: QbittorrentPathMapping[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const from =
        typeof (entry as { from?: unknown }).from === 'string'
          ? (entry as { from: string }).from.trim()
          : '';
      const to =
        typeof (entry as { to?: unknown }).to === 'string'
          ? (entry as { to: string }).to.trim()
          : '';
      if (!from || !to) continue;
      const dedupeKey = `${from.toLowerCase()}|${to.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push({ from, to });
      if (result.length >= 32) break;
    }
    return result;
  }

  private parsePathMappingsFromEnv(
    raw: string | undefined,
  ): QbittorrentPathMapping[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // Accept either JSON array or "from=to;from=to" form.
    if (trimmed.startsWith('[')) {
      try {
        return this.normalizePathMappings(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    const parsed: QbittorrentPathMapping[] = [];
    for (const segment of trimmed.split(/[;\n]+/)) {
      const eq = segment.indexOf('=');
      if (eq <= 0) continue;
      const from = segment.slice(0, eq).trim();
      const to = segment.slice(eq + 1).trim();
      if (from && to) parsed.push({ from, to });
    }
    return this.normalizePathMappings(parsed);
  }
}

