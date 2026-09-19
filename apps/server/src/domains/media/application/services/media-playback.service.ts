import { Injectable, Logger } from '@nestjs/common';
import { MediaItem } from '../../domain/entities/media-item.entity';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { MediaProbeAdapter } from '../../infrastructure/media-probe.adapter';
import { MediaFileResolutionService } from './path-resolution/media-file-resolution.service';
import { ProgressivePlaybackSourceRegistry } from '../../../core/application/extensions/progressive-playback-source';

interface MediaPlaybackAudioTrack {
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

@Injectable()
export class MediaPlaybackService {
  private readonly directPlayExtensions = new Set(['.mp4', '.m4v', '.webm']);
  private readonly directPlayMusicExtensions = new Set([
    '.aac',
    '.flac',
    '.m4a',
    '.mp3',
    '.oga',
    '.ogg',
    '.opus',
    '.wav',
  ]);
  private readonly directPlayVideoCodecHints = [
    'h264',
    'avc',
    'avc1',
    'vp8',
    'vp9',
    'av1',
  ];
  private readonly directPlayAudioCodecHints = [
    'aac',
    'alac',
    'flac',
    'mp3',
    'opus',
    'pcm',
    'vorbis',
  ];
  private readonly logger = new Logger(MediaPlaybackService.name);

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly mediaFileResolutionService: MediaFileResolutionService,
    private readonly progressivePlaybackSources: ProgressivePlaybackSourceRegistry,
  ) {}

  async getPlaybackAudioTracks(
    item: MediaItem,
  ): Promise<MediaPlaybackAudioTrack[]> {
    const systemSettings = await this.systemSettingsService.getSettings();
    const ffprobePath = systemSettings.ffprobePath || 'ffprobe';

    const canonicalFilePath = await this.mediaFileResolutionService
      .resolveMediaFilePath(item.filePath, item.relativePath)
      .catch(() => item.filePath);
    const probePath =
      await this.mediaFileResolutionService.resolvePlaybackProbePath(
        canonicalFilePath,
      );

    try {
      const payload = await this.mediaProbeAdapter.probeFile(
        probePath,
        ffprobePath,
      );
      const streams = Array.isArray(payload.streams) ? payload.streams : [];
      const audioStreams = streams.filter(
        (stream) =>
          stream.codec_type === 'audio' &&
          Number.isInteger(stream.index) &&
          stream.index >= 0,
      );

      if (audioStreams.length === 0) {
        return [];
      }

      const defaultStreamIndex =
        audioStreams.find((stream) => (stream.disposition?.default ?? 0) > 0)
          ?.index ?? audioStreams[0].index;

      return audioStreams.map((stream, position) => {
        const language = this.normalizePlaybackTrackLanguage(
          stream.tags?.language,
        );
        const codec = this.normalizePlaybackTrackCodec(stream.codec_name);
        const channels =
          typeof stream.channels === 'number' &&
          Number.isFinite(stream.channels)
            ? Math.max(1, Math.round(stream.channels))
            : null;
        const title = stream.tags?.title?.trim() || '';

        return {
          streamIndex: stream.index,
          label: this.buildPlaybackTrackLabel({
            fallbackPosition: position + 1,
            title,
            language,
            codec,
            channels,
          }),
          language,
          codec,
          channels,
          isDefault: stream.index === defaultStreamIndex,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to list audio tracks for ${item.relativePath}: ${message}`,
      );
      return [];
    }
  }

  async getPlaybackPlan(item: MediaItem) {
    const extensionFields =
      await this.progressivePlaybackSources.decoratePlaybackPlan(item);

    return {
      mediaId: item.id,
      title: item.title,
      directPlay: {
        supported: this.supportsDirectPlay(item),
        url: `/api/stream/${item.id}/direct`,
      },
      hls: {
        startUrl: `/api/stream/${item.id}/hls/start`,
      },
      subtitles: {
        listUrl: `/api/subtitles/${item.id}`,
      },
      ...extensionFields,
    };
  }

  private supportsDirectPlay(item: MediaItem): boolean {
    const extension = item.extension.toLowerCase();
    if (item.libraryType === 'music') {
      return (
        this.directPlayMusicExtensions.has(extension) &&
        this.directPlayAudioCodecHints.some((hint) =>
          (item.audioCodec ?? '').toLowerCase().includes(hint),
        )
      );
    }

    if (!this.directPlayExtensions.has(extension)) {
      return false;
    }

    const videoCodec = (item.videoCodec ?? '').toLowerCase();
    if (!videoCodec) {
      return false;
    }

    const videoSupported = this.directPlayVideoCodecHints.some((hint) =>
      videoCodec.includes(hint),
    );
    if (!videoSupported) {
      return false;
    }

    const audioCodec = (item.audioCodec ?? '').toLowerCase();
    if (!audioCodec) {
      return true;
    }

    return this.directPlayAudioCodecHints.some((hint) =>
      audioCodec.includes(hint),
    );
  }

  private normalizePlaybackTrackLanguage(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private normalizePlaybackTrackCodec(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private buildPlaybackTrackLabel(input: {
    fallbackPosition: number;
    title: string;
    language: string | null;
    codec: string | null;
    channels: number | null;
  }): string {
    if (input.title) {
      return input.title;
    }

    const details: string[] = [];
    if (input.language) {
      details.push(input.language.toUpperCase());
    }
    if (input.codec) {
      details.push(input.codec.toUpperCase());
    }
    if (input.channels !== null) {
      details.push(`${input.channels}ch`);
    }

    if (details.length === 0) {
      return `Track ${input.fallbackPosition}`;
    }

    return `Track ${input.fallbackPosition} (${details.join(', ')})`;
  }
}
