import { Injectable, Logger } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import { MediaPreviewResolver } from '../../../infrastructure/resolvers/media-preview.resolver';
import { MediaProbeAdapter } from '../../../infrastructure/media-probe.adapter';
import { normalizeFfprobeChapterMarkers } from '../../../infrastructure/helpers/media-chapter-markers';
import type { ChapterThumbnailCapturePoint } from '../../../infrastructure/resolvers/media-preview-path-helpers';

export interface MediaMetadataArtworkRefreshResult {
  previewImagePath: string | null;
  backdropImagePath: string | null;
  chapterThumbnails: MediaItem['chapterThumbnails'];
}

@Injectable()
export class MediaMetadataArtworkRefreshService {
  private readonly logger = new Logger(MediaMetadataArtworkRefreshService.name);

  constructor(
    private readonly mediaPreviewResolver: MediaPreviewResolver,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async rebuildArtworkForMetadataUpdate(input: {
    item: MediaItem;
    resolvedFilePath: string;
    preferredPosterUrl: string | null;
    preferredBackdropUrl: string | null;
    forceDownload: boolean;
    allowExistingFallback: boolean;
  }): Promise<MediaMetadataArtworkRefreshResult> {
    const existingPreview = input.allowExistingFallback
      ? this.normalizeOptionalString(input.item.previewImagePath)
      : null;
    const existingBackdrop = input.allowExistingFallback
      ? this.normalizeOptionalString(input.item.backdropImagePath)
      : null;
    const existingChapters = input.allowExistingFallback
      ? input.item.chapterThumbnails
      : [];

    const sidecarPreviewImagePath = await this.mediaPreviewResolver
      .findPreviewImagePath(input.resolvedFilePath)
      .catch(() => null);

    let chapterThumbnails: MediaItem['chapterThumbnails'] = [];
    try {
      const fileStats = await stat(input.resolvedFilePath);
      if (fileStats.isFile()) {
        const settings = await this.systemSettingsService.getSettings();

        let chapterMarkers: ChapterThumbnailCapturePoint[] | undefined;
        try {
          const parsed = await this.mediaProbeAdapter.probeFile(
            input.resolvedFilePath,
            settings.ffprobePath || 'ffprobe',
          );

          chapterMarkers = normalizeFfprobeChapterMarkers(
            parsed.chapters,
            Math.max(0, input.item.durationSeconds),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.debug(
            `Chapter probe skipped for ${input.item.filePath}; using random fallback: ${message}`,
          );
        }

        chapterThumbnails =
          await this.mediaPreviewResolver.generateChapterThumbnails(
            input.resolvedFilePath,
            Math.max(0, input.item.durationSeconds),
            fileStats.mtimeMs,
            settings.ffmpegPath,
            settings.thumbnailCaptureCount,
            chapterMarkers,
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Chapter thumbnail refresh skipped for ${input.item.filePath}: ${message}`,
      );
    }

    const posterSourceUrl = this.normalizeOptionalString(
      input.preferredPosterUrl,
    );
    const backdropSourceUrl = this.normalizeOptionalString(
      input.preferredBackdropUrl,
    );

    const [downloadedPosterImagePath, downloadedBackdropImagePath] =
      await Promise.all([
        posterSourceUrl
          ? this.mediaPreviewResolver.downloadPosterThumbnail(
              posterSourceUrl,
              input.resolvedFilePath,
              input.forceDownload,
            )
          : Promise.resolve<string | null>(null),
        backdropSourceUrl
          ? this.mediaPreviewResolver.downloadBackdropThumbnail(
              backdropSourceUrl,
              input.resolvedFilePath,
              input.forceDownload,
            )
          : Promise.resolve<string | null>(null),
      ]);

    const metadataPosterImagePath =
      downloadedPosterImagePath || posterSourceUrl;
    const metadataBackdropImagePath =
      downloadedBackdropImagePath || backdropSourceUrl;

    const previewImagePath =
      this.mediaPreviewResolver.selectBestPreviewImagePath(
        sidecarPreviewImagePath,
        metadataPosterImagePath,
        chapterThumbnails,
      );
    const backdropImagePath =
      this.mediaPreviewResolver.selectBestBackdropImagePath(
        metadataBackdropImagePath,
        chapterThumbnails,
        sidecarPreviewImagePath,
      );

    return {
      previewImagePath: previewImagePath ?? existingPreview,
      backdropImagePath: backdropImagePath ?? existingBackdrop,
      chapterThumbnails:
        chapterThumbnails.length > 0 ? chapterThumbnails : existingChapters,
    };
  }

  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }
}
