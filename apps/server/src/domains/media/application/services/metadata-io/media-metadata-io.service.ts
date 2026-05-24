import { BadRequestException, Injectable } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaPathResolverService } from '../path-resolution/media-path-resolver.service';
import { MediaLibraryLocationsService } from '../library-locations/media-library-locations.service';
import {
  extractImportedImageAssetsValue,
  extractImportedItemsValue,
  isObjectRecordValue,
  normalizeDigitalMediaTypeValue,
  normalizeImportedChapterThumbnailsValue,
  normalizeImportedMediaDetailsValue,
  normalizeImportedRelativePathValue,
  normalizeImportedSubtitleDetailsValue,
  normalizeImportedTimestampValue,
  normalizeImportedTypeValue,
  normalizeRemoteSourceValue,
  readOptionalNumberValue,
  readOptionalStringValue,
  readRequiredStringValue,
  readStringArrayValue,
  toNonNegativeIntegerValue,
  toNonNegativeNullableIntegerValue,
  toNonNegativeNumberValue,
  toNullableNumberValue,
} from './media-metadata-io-import.helpers';
import {
  exportImagePathAsAssetValue,
  matchPathToMediaLocationValue,
  restorePortableImagePathValue,
  toPortableRelativePathValue,
} from './media-metadata-io-path-asset.helpers';

export interface MetadataExportImageAsset {
  mimeType: string;
  base64: string;
}

export interface MetadataImportPathContext {
  roots: string[];
  rootByLabel: Map<string, string>;
}

export interface ResolvedMediaLocationPath {
  absoluteFilePath: string;
  locationRoot: string;
  locationLabel: string;
  relativePathUnderLocation: string;
}

@Injectable()
export class MediaMetadataIoService {
  private readonly imageAssetPrefix = 'asset://';
  private readonly posterThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'posters',
  );
  private readonly backdropThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'backdrops',
  );

  constructor(
    private readonly mediaPathResolver: MediaPathResolverService,
    private readonly mediaLibraryLocationsService: MediaLibraryLocationsService,
  ) {}

  async createImportPathContext(): Promise<MetadataImportPathContext> {
    const roots = (
      await this.mediaLibraryLocationsService.resolveScanLocations()
    ).map((location) => resolve(location));
    const rootByLabel = new Map<string, string>();

    for (const root of roots) {
      const label = basename(root).trim().toLowerCase();
      if (!label || rootByLabel.has(label)) {
        continue;
      }

      rootByLabel.set(label, root);
    }

    return {
      roots,
      rootByLabel,
    };
  }

  async toPortableExportItem(
    item: MediaItem,
    pathContext: MetadataImportPathContext,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<MediaItem> {
    const portableRelativePath = this.toPortableRelativePath(item, pathContext);
    const portableFilePath = portableRelativePath || basename(item.filePath);
    const previewImagePath = await this.exportImagePathAsAsset(
      item.previewImagePath,
      imageAssets,
    );
    const backdropImagePath = await this.exportImagePathAsAsset(
      item.backdropImagePath,
      imageAssets,
    );

    return {
      ...item,
      relativePath: portableRelativePath,
      filePath: portableFilePath,
      previewImagePath,
      backdropImagePath,
      // Chapter thumbnails are intentionally omitted from portable exports
      // because they are machine-local cache artifacts and can be regenerated.
      chapterThumbnails: [],
    };
  }

  async restorePortableImagePaths(
    item: MediaItem,
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<MediaItem> {
    const [previewImagePath, backdropImagePath] = await Promise.all([
      this.restorePortableImagePath(
        item.previewImagePath,
        'poster',
        imageAssets,
        restoredAssetPathById,
      ),
      this.restorePortableImagePath(
        item.backdropImagePath,
        'backdrop',
        imageAssets,
        restoredAssetPathById,
      ),
    ]);

    return {
      ...item,
      previewImagePath,
      backdropImagePath,
    };
  }

  normalizeImportedRelativePath(value: string): string {
    return normalizeImportedRelativePathValue(value);
  }

  async resolveImportedFilePathWithinLocations(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): Promise<ResolvedMediaLocationPath> {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    for (const candidate of candidates) {
      if (!(await this.fileExists(candidate))) {
        continue;
      }

      const matchedLocation = this.matchPathToMediaLocation(candidate, context);
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    const fuzzyResolved = await this.mediaPathResolver.resolveRelativePathFuzzy(
      relativePath,
      context,
    );
    if (fuzzyResolved) {
      const matchedLocation = this.matchPathToMediaLocation(
        fuzzyResolved,
        context,
      );
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    throw new BadRequestException(
      'Imported media file does not exist in configured media locations.',
    );
  }

  rebaseImportedFilePath(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): string {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    if (candidates.length === 0) {
      throw new BadRequestException('Imported filePath cannot be empty.');
    }

    return candidates[0];
  }

  extractImportedItems(value: unknown): unknown[] {
    return extractImportedItemsValue(value);
  }

  extractImportedImageAssets(
    value: unknown,
  ): Record<string, MetadataExportImageAsset> | null {
    return extractImportedImageAssetsValue(value);
  }

  readRequiredString(
    source: Record<string, unknown>,
    key: string,
    context: string,
  ): string {
    return readRequiredStringValue(source, key, context);
  }

  readOptionalString(
    source: Record<string, unknown>,
    key: string,
  ): string | null {
    return readOptionalStringValue(source, key);
  }

  readOptionalNumber(
    source: Record<string, unknown>,
    key: string,
  ): number | null {
    return readOptionalNumberValue(source, key);
  }

  readStringArray(source: Record<string, unknown>, key: string): string[] {
    return readStringArrayValue(source, key);
  }

  isObjectRecord(value: unknown): value is Record<string, unknown> {
    return isObjectRecordValue(value);
  }

  normalizeImportedType(value: string | null): 'movie' | 'show' | 'other' {
    return normalizeImportedTypeValue(value);
  }

  normalizeDigitalMediaType(
    value: string | null,
  ): 'video' | 'audio' | 'image' | 'other' {
    return normalizeDigitalMediaTypeValue(value);
  }

  normalizeRemoteSource(value: string | null): 'tmdb' | 'jikan' | undefined {
    return normalizeRemoteSourceValue(value);
  }

  normalizeImportedSubtitleDetails(
    value: unknown,
  ): MediaItem['subtitleDetails'] {
    return normalizeImportedSubtitleDetailsValue(value);
  }

  normalizeImportedChapterThumbnails(
    value: unknown,
  ): MediaItem['chapterThumbnails'] {
    return normalizeImportedChapterThumbnailsValue(value);
  }

  normalizeImportedMediaDetails(value: unknown): MediaItem['mediaDetails'] {
    return normalizeImportedMediaDetailsValue(value);
  }

  toNullableNumber(value: number | null): number | null {
    return toNullableNumberValue(value);
  }

  toNonNegativeNumber(value: number | null, fallback = 0): number {
    return toNonNegativeNumberValue(value, fallback);
  }

  toNonNegativeInteger(value: number | null, fallback = 0): number {
    return toNonNegativeIntegerValue(value, fallback);
  }

  toNonNegativeNullableInteger(value: number | null): number | null {
    return toNonNegativeNullableIntegerValue(value);
  }

  normalizeImportedTimestamp(value: string | null, fallback: string): string {
    return normalizeImportedTimestampValue(value, fallback);
  }

  private toPortableRelativePath(
    item: MediaItem,
    context: MetadataImportPathContext,
  ): string {
    return toPortableRelativePathValue(item, context);
  }

  private async exportImagePathAsAsset(
    imagePath: string | null,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<string | null> {
    return exportImagePathAsAssetValue(
      imagePath,
      this.imageAssetPrefix,
      imageAssets,
    );
  }

  private async restorePortableImagePath(
    imagePath: string | null,
    variant: 'poster' | 'backdrop',
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<string | null> {
    return restorePortableImagePathValue(
      imagePath,
      variant,
      imageAssets,
      restoredAssetPathById,
      {
        imageAssetPrefix: this.imageAssetPrefix,
        posterThumbnailDir: this.posterThumbnailDir,
        backdropThumbnailDir: this.backdropThumbnailDir,
      },
    );
  }

  private matchPathToMediaLocation(
    filePath: string,
    context: MetadataImportPathContext,
  ): ResolvedMediaLocationPath | null {
    return matchPathToMediaLocationValue(filePath, context);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
}
