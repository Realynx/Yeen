import { Injectable, Logger } from '@nestjs/common';
import { dirname } from 'node:path';
import { MediaService } from '../../../media/application/services/media.service';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { SubtitleTrack } from '../../domain/entities/subtitle-track.entity.ts/subtitle-track.entity';
import { SubtitleTracksService } from './subtitle-tracks.service';

@Injectable()
export class SubtitleListingService {
  private readonly logger = new Logger(SubtitleListingService.name);

  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly subtitleTracksService: SubtitleTracksService,
  ) {}

  async list(mediaId: string, accessToken: string | null = null) {
    const media = await this.mediaService.getById(mediaId);
    const systemSettings = await this.systemSettingsService.getSettings();
    const resolvedMediaFilePath = await this.mediaService
      .resolveMediaFilePath(media.filePath, media.relativePath)
      .catch(() => media.filePath);

    const [embeddedTracks, externalTracks] = await Promise.all([
      this.subtitleTracksService
        .probeEmbeddedTracks(
          mediaId,
          resolvedMediaFilePath,
          systemSettings.ffprobePath,
        )
        .catch((error: unknown) => {
          const rawMessage =
            error instanceof Error ? error.message : String(error);
          const message = this.sanitizeMediaPathInMessage(
            rawMessage,
            resolvedMediaFilePath,
            media.relativePath,
          );
          this.logger.debug(
            `Skipping embedded subtitle probe for ${mediaId}: ${message}`,
          );
          return [];
        }),
      this.subtitleTracksService
        .prepareExternalTracks(
          mediaId,
          resolvedMediaFilePath,
          systemSettings.ffmpegPath,
        )
        .catch((error: unknown) => {
          const rawMessage =
            error instanceof Error ? error.message : String(error);
          const message = this.sanitizeMediaPathInMessage(
            rawMessage,
            resolvedMediaFilePath,
            media.relativePath,
          );
          this.logger.debug(
            `Skipping external subtitle discovery for ${mediaId}: ${message}`,
          );
          return [];
        }),
    ]);

    const tracks = [...embeddedTracks, ...externalTracks];

    return {
      tracks: tracks.map((track) => this.withAccessToken(track, accessToken)),
    };
  }

  private withAccessToken(
    track: SubtitleTrack,
    accessToken: string | null,
  ): SubtitleTrack {
    const normalizedToken = accessToken?.trim() ?? '';
    if (!normalizedToken || !track.url) {
      return track;
    }

    try {
      const parsed = new URL(track.url, 'http://localhost');
      parsed.searchParams.set('access_token', normalizedToken);

      const nextUrl = /^https?:\/\//i.test(track.url)
        ? parsed.toString()
        : `${parsed.pathname}${parsed.search}`;

      return {
        ...track,
        url: nextUrl,
      };
    } catch {
      const separator = track.url.includes('?') ? '&' : '?';
      return {
        ...track,
        url: `${track.url}${separator}access_token=${encodeURIComponent(normalizedToken)}`,
      };
    }
  }

  private sanitizeMediaPathInMessage(
    message: string,
    mediaFilePath: string,
    relativePath: string,
  ): string {
    if (!mediaFilePath) {
      return message;
    }

    const normalizedRelativePath =
      relativePath.replace(/\\/g, '/') || '<media-path>';
    const normalizedRelativeDirectory = normalizedRelativePath.includes('/')
      ? normalizedRelativePath.slice(0, normalizedRelativePath.lastIndexOf('/'))
      : normalizedRelativePath;

    const replacements: Array<{ original: string; replacement: string }> = [
      {
        original: mediaFilePath,
        replacement: normalizedRelativePath,
      },
      {
        original: dirname(mediaFilePath),
        replacement: normalizedRelativeDirectory || '<media-directory>',
      },
    ];

    let sanitized = message;
    for (const entry of replacements) {
      if (!entry.original) {
        continue;
      }

      const pathVariants = new Set<string>([
        entry.original,
        entry.original.replace(/\\/g, '/'),
        entry.original.replace(/\//g, '\\'),
      ]);

      for (const variant of pathVariants) {
        if (!variant) {
          continue;
        }

        sanitized = sanitized.split(variant).join(entry.replacement);
      }
    }

    return sanitized;
  }
}
