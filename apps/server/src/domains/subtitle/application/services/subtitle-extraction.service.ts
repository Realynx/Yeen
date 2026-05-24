import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MediaService } from '../../../media/application/services/media.service';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { sanitizeVttFile } from '../../infrastructure/helpers/subtitle-vtt-sanitizer';

@Injectable()
export class SubtitleExtractionService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly subtitleCommandService: SubtitleCommandService,
    private readonly subtitleStorageService: SubtitleStorageService,
  ) {}

  async extractEmbedded(mediaId: string, streamIndex: number) {
    if (streamIndex < 0) {
      throw new BadRequestException('streamIndex must be >= 0.');
    }

    const media = await this.mediaService.getById(mediaId);
    const resolvedMediaFilePath = await this.mediaService.resolveMediaFilePath(
      media.filePath,
      media.relativePath,
    );
    const systemSettings = await this.systemSettingsService.getSettings();
    const folder =
      await this.subtitleStorageService.ensureSubtitleFolder(mediaId);

    const outputFileName = `embedded_${streamIndex}.vtt`;
    const outputPath = join(folder, outputFileName);

    if (!existsSync(outputPath)) {
      await this.subtitleCommandService
        .run(systemSettings.ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          resolvedMediaFilePath,
          '-map',
          `0:${streamIndex}`,
          '-c:s',
          'webvtt',
          outputPath,
        ])
        .catch((error: Error) => {
          throw new BadRequestException(
            `Unable to extract subtitle stream ${streamIndex}. ${error.message}`,
          );
        });
    }

    await sanitizeVttFile(outputPath).catch((error: Error) => {
      throw new BadRequestException(
        `Unable to normalize subtitle stream ${streamIndex}. ${error.message}`,
      );
    });

    return {
      mediaId,
      streamIndex,
      url: this.subtitleStorageService.subtitleUrl(mediaId, outputFileName),
    };
  }
}
