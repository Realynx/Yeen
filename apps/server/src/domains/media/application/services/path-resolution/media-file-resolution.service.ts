import { Injectable, NotFoundException } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  MediaMetadataIoService,
  type MetadataImportPathContext,
} from '../metadata-io/media-metadata-io.service';
import { MediaPathResolverService } from './media-path-resolver.service';
import { MediaLibraryLocationsService } from '../library-locations/media-library-locations.service';

@Injectable()
export class MediaFileResolutionService {
  constructor(
    private readonly mediaPathResolver: MediaPathResolverService,
    private readonly mediaMetadataIoService: MediaMetadataIoService,
    private readonly mediaLibraryLocationsService: MediaLibraryLocationsService,
  ) {}

  async resolveScanLocations(
    libraryPath?: string,
    libraryPaths?: string[],
  ): Promise<string[]> {
    return this.mediaLibraryLocationsService.resolveScanLocations(
      libraryPath,
      libraryPaths,
    );
  }

  async resolveMediaFilePath(
    filePath: string,
    relativePath: string,
    providedContext?: MetadataImportPathContext,
  ): Promise<string> {
    const context =
      providedContext ??
      (await this.mediaMetadataIoService.createImportPathContext());
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      filePath,
      relativePath,
      context,
    );

    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    const fuzzyResolved = await this.mediaPathResolver.resolveRelativePathFuzzy(
      relativePath,
      context,
    );
    if (fuzzyResolved) {
      return fuzzyResolved;
    }

    throw new NotFoundException('Unable to resolve media file path.');
  }

  async resolvePlaybackProbePath(canonicalFilePath: string): Promise<string> {
    if (await this.fileExists(canonicalFilePath)) {
      return canonicalFilePath;
    }

    const inProgressPath = `${canonicalFilePath}.!qB`;
    if (await this.fileExists(inProgressPath)) {
      return inProgressPath;
    }

    return canonicalFilePath;
  }

  toFilePathKey(filePath: string): string {
    const normalized = resolve(filePath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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
