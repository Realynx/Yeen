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
import { buildMediaDedupeKey } from '../../domain/media-dedupe-key';
import type {
  MediaLibraryLocation,
  MediaLibraryType,
} from '@yeen/shared-contracts';

interface SourceFile {
  sourcePath: string;
  libraryType: MediaLibraryType;
  locationLabel: string;
  filePath: string;
  displayPath: string;
  existingItem: MediaItem | null;
}

interface SourceCollectionResult {
  sourceFiles: SourceFile[];
  discoveredFiles: number;
  skippedIndexedFiles: number;
  refreshQueuedFiles: number;
  newQueuedFiles: number;
}

interface ProbeResult {
  items: MediaItem[];
  failedFiles: number;
  refreshedIndexedCount: number;
  newlyIndexedCount: number;
}

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

  async runScan(
    scanId: string,
    sourceLocations: MediaLibraryLocation[],
  ): Promise<void> {
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

      const collection = await this.collectSourceFiles(
        scanId,
        sourceLocations,
        existingItemByFilePathKey,
      );
      const { sourceFiles, skippedIndexedFiles } = collection;

      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: null,
        processedFiles: 0,
        failedFiles: 0,
        indexedItems: 0,
        skippedIndexedFiles,
        totalFiles: sourceFiles.length,
        message: this.probingMessage(collection),
      });
      const normalizedTitleByPath = await this.normalizeSourceTitles(
        scanId,
        sourceFiles,
      );
      const probeResult = await this.probeSourceFiles(
        scanId,
        sourceFiles,
        normalizedTitleByPath,
        skippedIndexedFiles,
      );
      const { items, failedFiles, refreshedIndexedCount, newlyIndexedCount } =
        probeResult;

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
      const completionMessage = this.completionMessage(
        newlyIndexedCount,
        refreshedIndexedCount,
        existingRetainedCount,
        sourceLocations.length,
        deduplicatedItems.length,
        duplicateMessage,
      );

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

  private async collectSourceFiles(
    scanId: string,
    locations: MediaLibraryLocation[],
    existingByPath: Map<string, MediaItem>,
  ): Promise<SourceCollectionResult> {
    const result: SourceCollectionResult = {
      sourceFiles: [],
      discoveredFiles: 0,
      skippedIndexedFiles: 0,
      refreshQueuedFiles: 0,
      newQueuedFiles: 0,
    };
    for (const location of locations) {
      await this.collectLocationFiles(scanId, location, existingByPath, result);
      this.mediaScanStore.update(scanId, {
        totalFiles: result.sourceFiles.length,
        skippedIndexedFiles: result.skippedIndexedFiles,
      });
    }
    return result;
  }

  private async collectLocationFiles(
    scanId: string,
    location: MediaLibraryLocation,
    existingByPath: Map<string, MediaItem>,
    result: SourceCollectionResult,
  ): Promise<void> {
    const sourcePath = location.path;
    const locationLabel = basename(resolve(sourcePath)) || sourcePath;
    this.mediaScanStore.update(scanId, {
      phase: 'collecting',
      currentFile: sourcePath,
      message: `Collecting files from ${locationLabel}...`,
    });
    const files = await this.scanner.collectMediaFiles(
      sourcePath,
      location.type,
    );
    const normalizedRoot = resolve(sourcePath);
    for (const filePath of files) {
      result.discoveredFiles += 1;
      const key = this.mediaFileResolutionService.toFilePathKey(filePath);
      const existingItem = existingByPath.get(key) ?? null;
      if (
        existingItem &&
        !this.mediaIndexRefreshPolicyService.shouldRefreshIndexedItem(
          existingItem,
        )
      ) {
        result.skippedIndexedFiles += 1;
        continue;
      }
      const relativePath = relative(normalizedRoot, filePath)
        .split(sep)
        .join('/');
      result.sourceFiles.push({
        sourcePath,
        libraryType: location.type,
        locationLabel,
        filePath,
        displayPath: `${locationLabel}/${relativePath}`,
        existingItem,
      });
      if (existingItem) result.refreshQueuedFiles += 1;
      else result.newQueuedFiles += 1;
    }
  }

  private probingMessage(result: SourceCollectionResult): string {
    if (result.sourceFiles.length === 0) {
      if (result.discoveredFiles === 0)
        return 'No media files found. Saving existing index...';
      if (result.skippedIndexedFiles > 0) {
        return `No new or stale media files found (${result.skippedIndexedFiles} already indexed). Saving existing index...`;
      }
      return 'No media files found. Saving existing index...';
    }
    if (result.refreshQueuedFiles > 0 && result.newQueuedFiles > 0) {
      return `Analyzing ${result.newQueuedFiles} new files and refreshing ${result.refreshQueuedFiles} indexed files...`;
    }
    if (result.refreshQueuedFiles > 0) {
      return `Refreshing ${result.refreshQueuedFiles} indexed files...`;
    }
    if (result.skippedIndexedFiles > 0) {
      return `Analyzing ${result.sourceFiles.length} new files (${result.skippedIndexedFiles} already indexed)...`;
    }
    return 'Analyzing new media files...';
  }

  private async normalizeSourceTitles(
    scanId: string,
    sourceFiles: SourceFile[],
  ): Promise<Map<string, string>> {
    const paths = sourceFiles
      .filter(
        (sourceFile) =>
          !sourceFile.existingItem ||
          this.mediaIndexRefreshPolicyService.looksLikeProvisionalExternalMetadata(
            sourceFile.existingItem,
          ),
      )
      .map((sourceFile) => sourceFile.filePath);
    if (paths.length === 0) return new Map();
    this.mediaScanStore.update(scanId, {
      phase: 'probing',
      currentFile: null,
      message: 'Normalizing media names for new or provisional files...',
    });
    return this.mediaAiMetadataService.normalizeTitlesForPaths(
      paths,
      ({ done, total }) => {
        if (total <= 0) return;
        this.mediaScanStore.update(scanId, {
          message: `Normalizing media names (${Math.min(done, total)} of ${total} unique titles)...`,
        });
      },
    );
  }

  private async probeSourceFiles(
    scanId: string,
    sourceFiles: SourceFile[],
    normalizedTitles: Map<string, string>,
    skippedIndexedFiles: number,
  ): Promise<ProbeResult> {
    const result: ProbeResult = {
      items: [],
      failedFiles: 0,
      refreshedIndexedCount: 0,
      newlyIndexedCount: 0,
    };
    for (let index = 0; index < sourceFiles.length; index += 1) {
      const sourceFile = sourceFiles[index];
      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: sourceFile.displayPath,
        processedFiles: index,
        message: `Analyzing file ${index + 1} of ${sourceFiles.length}...`,
      });
      await this.probeSourceFile(sourceFile, normalizedTitles, result);
      this.mediaScanStore.update(scanId, {
        processedFiles: index + 1,
        indexedItems: result.items.length,
        failedFiles: result.failedFiles,
        skippedIndexedFiles,
      });
    }
    return result;
  }

  private async probeSourceFile(
    sourceFile: SourceFile,
    normalizedTitles: Map<string, string>,
    result: ProbeResult,
  ): Promise<void> {
    try {
      const title = normalizedTitles.get(sourceFile.filePath) ?? '';
      const item = await this.scanner.probeFile(
        sourceFile.filePath,
        sourceFile.sourcePath,
        title ? { title, normalizedTitle: title } : undefined,
        sourceFile.libraryType,
      );
      let indexedItem: MediaItem = {
        ...item,
        relativePath: `${sourceFile.locationLabel}/${item.relativePath}`,
      };
      if (sourceFile.existingItem) {
        indexedItem = this.mediaIndexedItemMergeService.mergeScannedIndexedItem(
          sourceFile.existingItem,
          indexedItem,
        );
      }
      await this.mediaStore.upsert(indexedItem);
      const stored = await this.mediaStore.findByFilePath(indexedItem.filePath);
      result.items.push(stored ?? indexedItem);
      if (sourceFile.existingItem) result.refreshedIndexedCount += 1;
      else result.newlyIndexedCount += 1;
    } catch (error) {
      result.failedFiles += 1;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Skipping ${sourceFile.displayPath}: ${message}`);
    }
  }

  private completionMessage(
    newlyIndexed: number,
    refreshed: number,
    retained: number,
    locationCount: number,
    totalItems: number,
    duplicateMessage: string,
  ): string {
    if (newlyIndexed === 0 && refreshed === 0) {
      return `Scan complete: no new files found across ${locationCount} locations; retained ${totalItems} indexed items${duplicateMessage}`;
    }
    if (newlyIndexed > 0 && refreshed > 0) {
      return `Scan complete: indexed ${newlyIndexed} new files, refreshed ${refreshed} existing items, and retained ${retained} unchanged items across ${locationCount} locations${duplicateMessage}`;
    }
    if (newlyIndexed > 0) {
      return `Scan complete: indexed ${newlyIndexed} new files and retained ${retained} existing items across ${locationCount} locations${duplicateMessage}`;
    }
    return `Scan complete: refreshed ${refreshed} existing items and retained ${retained} unchanged items across ${locationCount} locations${duplicateMessage}`;
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
    return buildMediaDedupeKey({
      ...item,
      normalizedTitle: item.normalizedTitle || normalizeForKey(item.title),
    });
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
