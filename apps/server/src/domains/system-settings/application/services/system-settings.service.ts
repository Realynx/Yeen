import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdateSystemSettingsDto } from '../dto/update-system-settings.dto';
import {
  PublicSystemSettings,
  SystemSettings,
} from '../../domain/entities/system-settings.entity';
import { SystemSettingsStore } from '../../infrastructure/stores/system-settings.store';

const DEFAULT_MEDIA_METADATA_SQLITE_PATH = 'data/media-metadata.sqlite';
const DEFAULT_AI_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_AI_MODEL = 'llama3.1:8b';

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

  async getPublicSettings(): Promise<PublicSystemSettings> {
    const settings = await this.getSettings();
    const { theAudioDbCustomApiKey, ...publicSettings } = settings;
    return {
      ...publicSettings,
      theAudioDbHasCustomApiKey: Boolean(theAudioDbCustomApiKey),
    };
  }

  async updateSettings(dto: UpdateSystemSettingsDto): Promise<SystemSettings> {
    const current = await this.getSettings();
    const merged = {
      ...current,
      ...dto,
    } as Partial<SystemSettings>;

    if (dto.clearTheAudioDbCustomApiKey) {
      merged.theAudioDbCustomApiKey = '';
    } else if (dto.theAudioDbCustomApiKey === undefined) {
      merged.theAudioDbCustomApiKey = current.theAudioDbCustomApiKey;
    }

    const normalized = this.normalize(merged);
    await this.systemSettingsStore.replace(normalized);

    return normalized;
  }

  private defaultsFromEnv(): SystemSettings {
    return {
      ffmpegPath: this.envText('FFMPEG_PATH', 'ffmpeg'),
      ffprobePath: this.envText('FFPROBE_PATH', 'ffprobe'),
      thumbnailCaptureCount: this.parseIntWithFallback(
        this.configService.get<string>('THUMBNAIL_CAPTURE_COUNT'),
        6,
      ),
      mediaMetadataSqlitePath: this.envText(
        'MEDIA_METADATA_SQLITE_PATH',
        DEFAULT_MEDIA_METADATA_SQLITE_PATH,
      ),
      aiMetadataEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('AI_METADATA_ENABLED'),
        false,
      ),
      aiProvider: this.normalizeAiProvider(
        this.configService.get<string>('AI_PROVIDER'),
      ),
      aiModel: this.envText('AI_MODEL', DEFAULT_AI_MODEL),
      aiOllamaBaseUrl: this.envText(
        'AI_OLLAMA_BASE_URL',
        DEFAULT_AI_OLLAMA_BASE_URL,
      ),
      aiOpenAiApiKey: this.envText('AI_OPENAI_API_KEY', ''),
      aiDeduplicationEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('AI_DEDUPLICATION_ENABLED'),
        true,
      ),
      aiRequestTimeoutMs: this.parseIntWithFallback(
        this.configService.get<string>('AI_REQUEST_TIMEOUT_MS'),
        20000,
      ),
      tmdbApiKey: this.envText('TMDB_API_KEY', ''),
      openSubtitlesApiKey: this.envText('OPENSUBTITLES_API_KEY', ''),
      theAudioDbEnabled: this.parseBooleanWithFallback(
        this.configService.get<string>('THEAUDIODB_ENABLED'),
        true,
      ),
      theAudioDbCustomApiKey: this.envText('THEAUDIODB_API_KEY', ''),
      theAudioDbChartCountry: this.envText('THEAUDIODB_CHART_COUNTRY', 'US'),
      transcodeHardwareAcceleration: this.normalizeHardwareAcceleration(
        this.configService.get<string>('TRANSCODE_HARDWARE_ACCELERATION'),
      ),
      transcodePreset: this.envText('TRANSCODE_PRESET', 'veryfast'),
      transcodeCrf: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_CRF'),
        22,
      ),
      transcodeDefaultMaxBitrateKbps: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_DEFAULT_MAX_BITRATE_KBPS'),
        4500,
      ),
      transcodeAudioBitrateKbps: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_AUDIO_BITRATE_KBPS'),
        160,
      ),
      transcodeMaxOutputHeight: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_MAX_OUTPUT_HEIGHT'),
        1080,
      ),
      transcodeRateControlBufferSeconds: this.parseIntWithFallback(
        this.configService.get<string>('TRANSCODE_RATE_CONTROL_BUFFER_SECONDS'),
        3,
      ),
      hlsSegmentSeconds: this.parseIntWithFallback(
        this.configService.get<string>('HLS_SEGMENT_SECONDS'),
        4,
      ),
      subtitleDefaultLanguage: this.envText('SUBTITLE_DEFAULT_LANGUAGE', 'en'),
    };
  }

  private normalize(input: Partial<SystemSettings>): SystemSettings {
    return {
      ffmpegPath: this.textOrFallback(input.ffmpegPath, 'ffmpeg'),
      ffprobePath: this.textOrFallback(input.ffprobePath, 'ffprobe'),
      thumbnailCaptureCount: this.clampInteger(
        input.thumbnailCaptureCount,
        1,
        30,
        6,
      ),
      mediaMetadataSqlitePath: this.textOrFallback(
        input.mediaMetadataSqlitePath,
        DEFAULT_MEDIA_METADATA_SQLITE_PATH,
      ),
      aiMetadataEnabled: this.normalizeBoolean(input.aiMetadataEnabled, false),
      aiProvider: this.normalizeAiProvider(input.aiProvider),
      aiModel: this.textOrFallback(input.aiModel, DEFAULT_AI_MODEL),
      aiOllamaBaseUrl: this.textOrFallback(
        input.aiOllamaBaseUrl,
        DEFAULT_AI_OLLAMA_BASE_URL,
      ),
      aiOpenAiApiKey: this.textOrFallback(input.aiOpenAiApiKey, ''),
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
      tmdbApiKey: this.textOrFallback(input.tmdbApiKey, ''),
      openSubtitlesApiKey: this.textOrFallback(input.openSubtitlesApiKey, ''),
      theAudioDbEnabled: this.normalizeBoolean(input.theAudioDbEnabled, true),
      theAudioDbCustomApiKey: this.textOrFallback(
        input.theAudioDbCustomApiKey,
        '',
      ),
      theAudioDbChartCountry: this.normalizeCountry(
        input.theAudioDbChartCountry,
      ),
      transcodeHardwareAcceleration: this.normalizeHardwareAcceleration(
        input.transcodeHardwareAcceleration,
      ),
      transcodePreset: this.textOrFallback(input.transcodePreset, 'veryfast'),
      transcodeCrf: this.clampInteger(input.transcodeCrf, 12, 40, 22),
      transcodeDefaultMaxBitrateKbps: this.clampInteger(
        input.transcodeDefaultMaxBitrateKbps,
        250,
        50000,
        4500,
      ),
      transcodeAudioBitrateKbps: this.clampInteger(
        input.transcodeAudioBitrateKbps,
        48,
        384,
        160,
      ),
      transcodeMaxOutputHeight: this.clampInteger(
        input.transcodeMaxOutputHeight,
        240,
        2160,
        1080,
      ),
      transcodeRateControlBufferSeconds: this.clampInteger(
        input.transcodeRateControlBufferSeconds,
        1,
        30,
        3,
      ),
      hlsSegmentSeconds: this.clampInteger(input.hlsSegmentSeconds, 1, 20, 4),
      subtitleDefaultLanguage: this.textOrFallback(
        input.subtitleDefaultLanguage,
        'en',
      ),
    };
  }

  private envText(key: string, fallback: string): string {
    return this.textOrFallback(this.configService.get<string>(key), fallback);
  }

  private textOrFallback(value: string | undefined, fallback: string): string {
    return value?.trim() || fallback;
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

  private normalizeHardwareAcceleration(
    value: string | undefined,
  ): 'auto' | 'nvidia' | 'cpu' {
    return value === 'nvidia' || value === 'cpu' ? value : 'auto';
  }

  private normalizeCountry(value: string | undefined): string {
    const normalized = value?.trim().toUpperCase() ?? '';
    return /^[A-Z]{2}$/.test(normalized) ? normalized : 'US';
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
}
