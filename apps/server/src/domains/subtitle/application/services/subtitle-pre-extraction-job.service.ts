import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MediaItem } from '../../../media/domain/entities/media-item.entity';
import { MediaStore } from '../../../media/infrastructure/stores/media.store';
import {
  createIdleSubtitlePreExtractionProgress,
  type SubtitlePreExtractionProgress,
} from '../../domain/entities/subtitle-pre-extraction-progress.entity';
import { SubtitleExtractionService } from './subtitle-extraction.service';

const MAX_CONCURRENT_MEDIA_ITEMS = 2;

@Injectable()
export class SubtitlePreExtractionJobService {
  private readonly logger = new Logger(SubtitlePreExtractionJobService.name);
  private progress = createIdleSubtitlePreExtractionProgress();

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly subtitleExtractionService: SubtitleExtractionService,
  ) {}

  getProgress(): SubtitlePreExtractionProgress {
    return { ...this.progress };
  }

  start(): SubtitlePreExtractionProgress {
    if (this.progress.status === 'running') {
      return this.getProgress();
    }

    const now = new Date().toISOString();
    const jobId = randomUUID();
    this.progress = {
      jobId,
      status: 'running',
      totalMediaItems: 0,
      processedMediaItems: 0,
      extractedTracks: 0,
      existingTracks: 0,
      unsupportedTracks: 0,
      failedTracks: 0,
      failedMediaItems: 0,
      currentMediaTitle: null,
      message: 'Finding Local Media Items with embedded subtitles...',
      error: null,
      lastFailure: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };

    void this.run(jobId);
    return this.getProgress();
  }

  private async run(jobId: string): Promise<void> {
    try {
      const mediaItems = (await this.mediaStore.all()).filter((item) =>
        this.isSubtitleCandidate(item),
      );
      this.update(jobId, {
        totalMediaItems: mediaItems.length,
        message: this.runningMessage(0, mediaItems.length),
      });

      await this.processMediaItems(jobId, mediaItems);

      const now = new Date().toISOString();
      this.update(jobId, {
        status: 'completed',
        currentMediaTitle: null,
        message: this.completionMessage(),
        completedAt: now,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Subtitle pre-extraction failed unexpectedly.';
      this.logger.error(`Subtitle pre-extraction job failed: ${message}`);
      this.update(jobId, {
        status: 'failed',
        currentMediaTitle: null,
        message: 'Subtitle pre-extraction failed.',
        error: message,
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async processMediaItems(
    jobId: string,
    mediaItems: MediaItem[],
  ): Promise<void> {
    let nextIndex = 0;
    const workerCount = Math.min(MAX_CONCURRENT_MEDIA_ITEMS, mediaItems.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < mediaItems.length) {
        const mediaItem = mediaItems[nextIndex];
        nextIndex += 1;
        await this.processMediaItem(jobId, mediaItem);
      }
    });
    await Promise.all(workers);
  }

  private async processMediaItem(
    jobId: string,
    mediaItem: MediaItem,
  ): Promise<void> {
    this.update(jobId, {
      currentMediaTitle: mediaItem.title,
      message: this.runningMessage(
        this.progress.processedMediaItems,
        this.progress.totalMediaItems,
      ),
    });

    let itemFailed = false;
    try {
      const summary = await this.subtitleExtractionService.extractAllEmbedded(
        mediaItem.id,
      );
      itemFailed = summary.failed > 0;
      this.update(jobId, {
        extractedTracks: this.progress.extractedTracks + summary.extracted,
        existingTracks: this.progress.existingTracks + summary.alreadyReady,
        unsupportedTracks:
          this.progress.unsupportedTracks + summary.unsupported,
        failedTracks: this.progress.failedTracks + summary.failed,
        lastFailure:
          summary.failed > 0
            ? `${mediaItem.title}: ${summary.failed} Subtitle Track${summary.failed === 1 ? '' : 's'} could not be extracted.`
            : this.progress.lastFailure,
      });
    } catch (error) {
      itemFailed = true;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to inspect subtitles for ${mediaItem.id}: ${message}`,
      );
      this.update(jobId, {
        lastFailure: `${mediaItem.title}: subtitle inspection failed.`,
      });
    }

    this.update(jobId, {
      processedMediaItems: this.progress.processedMediaItems + 1,
      failedMediaItems: this.progress.failedMediaItems + (itemFailed ? 1 : 0),
    });
  }

  private isSubtitleCandidate(item: MediaItem): boolean {
    return item.libraryType === 'video' && item.digitalMediaType === 'video';
  }

  private update(
    jobId: string,
    patch: Partial<Omit<SubtitlePreExtractionProgress, 'jobId'>>,
  ): void {
    if (this.progress.jobId !== jobId) return;
    this.progress = {
      ...this.progress,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  }

  private runningMessage(processed: number, total: number): string {
    if (total === 0) return 'No Local Media Items need subtitle inspection.';
    return `Extracting subtitles for item ${Math.min(processed + 1, total)} of ${total}...`;
  }

  private completionMessage(): string {
    return `Subtitle extraction complete: extracted ${this.progress.extractedTracks}, kept ${this.progress.existingTracks} already extracted, skipped ${this.progress.unsupportedTracks} unsupported, and failed ${this.progress.failedTracks} tracks.`;
  }
}
