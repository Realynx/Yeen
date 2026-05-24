import { Injectable, Logger } from '@nestjs/common';
import { basename, relative, resolve, sep } from 'node:path';
import { normalizeForKey } from '../../infrastructure/helpers/title-normalizer';
import { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MediaScanStore } from '../../infrastructure/stores/media-scan.store';
import { MediaScannerService } from './scanner/media-scanner.service';
import { MediaIndexRefreshPolicyService } from './index-refresh/media-index-refresh-policy.service';
import { MediaIndexedItemMergeService } from './index-refresh/media-indexed-item-merge.service';
import { MediaAiMetadataService } from './ai-metadata/media-ai-metadata.service';
import { MediaFileResolutionService } from './path-resolution/media-file-resolution.service';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';

@Injectable()
export class MediaScanExecutionService {
  private readonly logger = new Logger(MediaScanExecutionService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaScanStore: MediaScanStore,
    private readonly scanner: MediaScannerService,
    private readonly mediaIndexRefreshPolicyService: MediaIndexRefreshPolicyService,
    private readonly mediaIndexedItemMergeService: MediaIndexedItemMergeService,
    private readonly mediaAiMetadataService: MediaAiMetadataService,
    private readonly mediaFileResolutionService: MediaFileResolutionService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async runScan(scanId: string, sourcePaths: string[]): Promise<void> {
    type SourceFile = {
      sourcePath: string;
      locationLabel: string;
      filePath: string;
      displayPath: string;
      existingItem: MediaItem | null;
    };

    try {
      this.mediaScanStore.update(scanId, {
        phase: 'collecting',
        message: 'Collecting media files...',
      });

      const existingItems = await this.mediaStore.all();
      const existingItemByFilePathKey = new Map(
        existingItems.map((item) => [
          this.mediaFileResolutionService.toFilePathKey(item.filePath),
          item,
        ]),
      );

      const sourceFiles: SourceFile[] = [];
      let discoveredFiles = 0;
      let skippedIndexedFiles = 0;
      let refreshQueuedFiles = 0;
      let newQueuedFiles = 0;

      for (const sourcePath of sourcePaths) {
        const locationLabel = basename(resolve(sourcePath)) || sourcePath;
        this.mediaScanStore.update(scanId, {
          phase: 'collecting',
          currentFile: sourcePath,
          message: `Collecting files from ${locationLabel}...`,
        });

        const files = await this.scanner.collectVideoFiles(sourcePath);
        const normalizedRoot = resolve(sourcePath);

        for (const filePath of files) {
          discoveredFiles += 1;

          const filePathKey =
            this.mediaFileResolutionService.toFilePathKey(filePath);
          const existingItem =
            existingItemByFilePathKey.get(filePathKey) ?? null;
          if (
            existingItem &&
            !this.mediaIndexRefreshPolicyService.shouldRefreshIndexedItem(
              existingItem,
            )
          ) {
            skippedIndexedFiles += 1;
            continue;
          }

          const relativePath = relative(normalizedRoot, filePath)
            .split(sep)
            .join('/');

          sourceFiles.push({
            sourcePath,
            locationLabel,
            filePath,
            displayPath: `${locationLabel}/${relativePath}`,
            existingItem,
          });

          if (existingItem) {
            refreshQueuedFiles += 1;
          } else {
            newQueuedFiles += 1;
          }
        }

        this.mediaScanStore.update(scanId, {
          totalFiles: sourceFiles.length,
          skippedIndexedFiles,
        });
      }

      const probingMessage =
        sourceFiles.length === 0
          ? discoveredFiles === 0
            ? 'No media files found. Saving existing index...'
            : skippedIndexedFiles > 0
              ? `No new or stale media files found (${skippedIndexedFiles} already indexed). Saving existing index...`
              : 'No media files found. Saving existing index...'
          : refreshQueuedFiles > 0 && newQueuedFiles > 0
            ? `Analyzing ${newQueuedFiles} new files and refreshing ${refreshQueuedFiles} indexed files...`
            : refreshQueuedFiles > 0
              ? `Refreshing ${refreshQueuedFiles} indexed files...`
              : skippedIndexedFiles > 0
                ? `Analyzing ${sourceFiles.length} new files (${skippedIndexedFiles} already indexed)...`
                : 'Analyzing new media files...';

      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: null,
        processedFiles: 0,
        failedFiles: 0,
        indexedItems: 0,
        skippedIndexedFiles,
        totalFiles: sourceFiles.length,
        message: probingMessage,
      });

      const items: MediaItem[] = [];
      let failedFiles = 0;
      let refreshedIndexedCount = 0;
      let newlyIndexedCount = 0;

      let normalizedTitleByPath = new Map<string, string>();
      const titleNormalizationPaths = sourceFiles
        .filter(
          (sourceFile) =>
            !sourceFile.existingItem ||
            this.mediaIndexRefreshPolicyService.looksLikeProvisionalTorrentMetadata(
              sourceFile.existingItem,
            ),
        )
        .map((sourceFile) => sourceFile.filePath);
      if (titleNormalizationPaths.length > 0) {
        this.mediaScanStore.update(scanId, {
          phase: 'probing',
          currentFile: null,
          message: 'Normalizing media names for new or provisional files...',
        });

        normalizedTitleByPath =
          await this.mediaAiMetadataService.normalizeTitlesForPaths(
            titleNormalizationPaths,
            ({ done, total }) => {
              if (total <= 0) {
                return;
              }
              this.mediaScanStore.update(scanId, {
                message: `Normalizing media names (${Math.min(done, total)} of ${total} unique titles)...`,
              });
            },
          );
      }

      for (let index = 0; index < sourceFiles.length; index += 1) {
        const sourceFile = sourceFiles[index];
        this.mediaScanStore.update(scanId, {
          phase: 'probing',
          currentFile: sourceFile.displayPath,
          processedFiles: index,
          message: `Analyzing file ${index + 1} of ${sourceFiles.length}...`,
        });

        try {
          const normalizedTitleHint =
            normalizedTitleByPath.get(sourceFile.filePath) ?? '';
          const item = await this.scanner.probeFile(
            sourceFile.filePath,
            sourceFile.sourcePath,
            normalizedTitleHint
              ? {
                  title: normalizedTitleHint,
                  normalizedTitle: normalizedTitleHint,
                }
              : undefined,
          );

          let indexedItem: MediaItem = {
            ...item,
            relativePath: `${sourceFile.locationLabel}/${item.relativePath}`,
          };

          if (sourceFile.existingItem) {
            indexedItem =
              this.mediaIndexedItemMergeService.mergeScannedIndexedItem(
                sourceFile.existingItem,
                indexedItem,
              );
          }

          await this.mediaStore.upsert(indexedItem);
          const stored = await this.mediaStore.findByFilePath(
            indexedItem.filePath,
          );
          items.push(stored ?? indexedItem);

          if (sourceFile.existingItem) {
            refreshedIndexedCount += 1;
          } else {
            newlyIndexedCount += 1;
          }
        } catch (error) {
          failedFiles += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Skipping ${sourceFile.displayPath}: ${message}`);
        }

        this.mediaScanStore.update(scanId, {
          processedFiles: index + 1,
          indexedItems: items.length,
          failedFiles,
          skippedIndexedFiles,
        });
      }

      const mergedByFilePath = new Map(
        existingItems.map((item) => [
          this.mediaFileResolutionService.toFilePathKey(item.filePath),
          item,
        ]),
      );
      for (const item of items) {
        mergedByFilePath.set(
          this.mediaFileResolutionService.toFilePathKey(item.filePath),
          item,
        );
      }

      const { items: deduplicatedItems, duplicatesRemoved } =
        await this.applyDeduplication([...mergedByFilePath.values()]);

      deduplicatedItems.sort((left, right) =>
        left.title.localeCompare(right.title),
      );

      this.mediaScanStore.update(scanId, {
        phase: 'saving',
        currentFile: null,
        message: 'Saving media index...',
      });

      await this.mediaStore.replaceAll(deduplicatedItems);

      const existingRetainedCount = Math.max(
        0,
        deduplicatedItems.length - newlyIndexedCount - refreshedIndexedCount,
      );
      const duplicateMessage =
        duplicatesRemoved > 0
          ? ` (${duplicatesRemoved} duplicates removed).`
          : '.';
      const completionMessage =
        newlyIndexedCount === 0 && refreshedIndexedCount === 0
          ? `Scan complete: no new files found across ${sourcePaths.length} locations; retained ${deduplicatedItems.length} indexed items${duplicateMessage}`
          : newlyIndexedCount > 0 && refreshedIndexedCount > 0
            ? `Scan complete: indexed ${newlyIndexedCount} new files, refreshed ${refreshedIndexedCount} existing items, and retained ${existingRetainedCount} unchanged items across ${sourcePaths.length} locations${duplicateMessage}`
            : newlyIndexedCount > 0
              ? `Scan complete: indexed ${newlyIndexedCount} new files and retained ${existingRetainedCount} existing items across ${sourcePaths.length} locations${duplicateMessage}`
              : `Scan complete: refreshed ${refreshedIndexedCount} existing items and retained ${existingRetainedCount} unchanged items across ${sourcePaths.length} locations${duplicateMessage}`;

      this.mediaScanStore.complete(scanId, {
        totalFiles: sourceFiles.length,
        processedFiles: sourceFiles.length,
        indexedItems: deduplicatedItems.length,
        failedFiles,
        skippedIndexedFiles,
        message: completionMessage,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Media scan failed unexpectedly.';

      this.logger.error(`Media scan failed: ${message}`);
      this.mediaScanStore.fail(scanId, message);
    }
  }

  private async applyDeduplication(items: MediaItem[]): Promise<{
    items: MediaItem[];
    duplicatesRemoved: number;
  }> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.aiDeduplicationEnabled) {
      return {
        items,
        duplicatesRemoved: 0,
      };
    }

    const deduplicated = new Map<string, MediaItem>();
    let duplicatesRemoved = 0;

    for (const item of items) {
      const key = item.dedupeKey || this.fallbackDedupeKey(item);
      const existing = deduplicated.get(key);

      if (!existing) {
        deduplicated.set(key, item);
        continue;
      }

      duplicatesRemoved += 1;
      deduplicated.set(key, this.choosePreferredDuplicate(existing, item));
    }

    return {
      items: [...deduplicated.values()],
      duplicatesRemoved,
    };
  }

  private fallbackDedupeKey(item: MediaItem): string {
    const normalizedTitle = item.normalizedTitle || normalizeForKey(item.title);

    if (item.type === 'show') {
      return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
    }

    if (item.type === 'movie') {
      return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  private choosePreferredDuplicate(
    primary: MediaItem,
    candidate: MediaItem,
  ): MediaItem {
    const primaryScore = this.qualityScore(primary);
    const candidateScore = this.qualityScore(candidate);

    if (candidateScore > primaryScore) {
      return candidate;
    }

    if (candidateScore < primaryScore) {
      return primary;
    }

    if (candidate.updatedAt > primary.updatedAt) {
      return candidate;
    }

    return primary;
  }

  private qualityScore(item: MediaItem): number {
    const resolution = (item.width ?? 0) * (item.height ?? 0);
    const sizeScore = Math.round(item.sizeBytes / 1_000_000);
    const subtitleScore = item.subtitleStreams * 3;

    return resolution + sizeScore + subtitleScore;
  }
}
