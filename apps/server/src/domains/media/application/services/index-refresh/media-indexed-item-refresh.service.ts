import { Injectable, Logger } from '@nestjs/common';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaLocationsStore } from '../../../infrastructure/stores/media-locations.store';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import {
  MediaScannerService,
  type MediaProbeHint,
} from '../scanner/media-scanner.service';
import { MediaIndexedItemMergeService } from './media-indexed-item-merge.service';

@Injectable()
export class MediaIndexedItemRefreshService {
  private readonly logger = new Logger(MediaIndexedItemRefreshService.name);

  constructor(
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly mediaStore: MediaStore,
    private readonly scanner: MediaScannerService,
    private readonly mediaIndexedItemMergeService: MediaIndexedItemMergeService,
  ) {}

  async refreshIndexedMediaItem(
    existing: MediaItem,
  ): Promise<MediaItem | null> {
    try {
      const libraryRoot = await this.resolveLibraryRootForFile(
        existing.filePath,
        dirname(existing.filePath),
      );
      const normalizedHint = existing.normalizedTitle?.trim() || '';
      const titleHint = existing.title?.trim() || '';
      const probeHint: MediaProbeHint | undefined =
        titleHint || normalizedHint
          ? {
              title: titleHint || normalizedHint,
              normalizedTitle: normalizedHint || titleHint,
              releaseYear: existing.releaseYear,
              mediaType: existing.type,
            }
          : undefined;

      const scanned = await this.scanner.probeFile(
        existing.filePath,
        libraryRoot,
        probeHint,
      );
      const merged = this.mediaIndexedItemMergeService.mergeScannedIndexedItem(
        existing,
        {
        ...scanned,
        relativePath: existing.relativePath,
        },
      );

      await this.mediaStore.upsert(merged);
      return (await this.mediaStore.findByFilePath(merged.filePath)) ?? merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Automatic metadata refresh skipped for ${existing.filePath}: ${message}`,
      );
      return null;
    }
  }

  private async resolveLibraryRootForFile(
    absoluteFilePath: string,
    fallbackRoot: string,
  ): Promise<string> {
    const configured = await this.mediaLocationsStore.all();
    const normalizedFile = resolve(absoluteFilePath);

    for (const rawLocation of configured) {
      const resolved = resolve(rawLocation);
      const rel = relative(resolved, normalizedFile);
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        return resolved;
      }
    }

    return resolve(fallbackRoot);
  }
}
