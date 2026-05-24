import { BadRequestException, Injectable } from '@nestjs/common';
import type { Dirent } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { MediaFsFileOpsService } from '../filesystem/media-fs-file-ops.service';
import { MediaLibraryLocationsService } from '../library-locations/media-library-locations.service';
import {
  buildRecyclePurgeMessage,
  collectDriveRoots,
  isValidRecycleOperationPath,
  normalizeRecycleOperationPaths,
} from './media-recycle-deletions-helpers';

export interface RecycleDeletionEntry {
  operationId: string;
  driveRoot: string;
  folderPath: string;
  createdAt: string | null;
  updatedAt: string;
  sizeBytes: number;
  fileCount: number;
}

export interface RecycleDeletionsListResult {
  rootsScanned: string[];
  totalEntries: number;
  totalSizeBytes: number;
  truncated: boolean;
  entries: RecycleDeletionEntry[];
}

export interface PurgeRecycleDeletionsResultItem {
  folderPath: string;
  success: boolean;
  reclaimedBytes: number;
  error?: string;
}

export interface PurgeRecycleDeletionsResult {
  requested: number;
  deleted: number;
  failed: number;
  reclaimedBytes: number;
  results: PurgeRecycleDeletionsResultItem[];
  message: string;
}

export interface PurgeRecycleDeletionsInput {
  operationPaths?: string[];
  purgeAll?: boolean;
  olderThanDays?: number;
}

@Injectable()
export class MediaRecycleDeletionsService {
  private readonly recycleRootFolderName = '.yeen-recycle';
  private readonly recycleDeleteCategoryName = 'media-deletions';

  constructor(
    private readonly mediaFsFileOpsService: MediaFsFileOpsService,
    private readonly mediaLibraryLocationsService: MediaLibraryLocationsService,
  ) {}

  async listRecycleDeletions(
    limit?: number,
  ): Promise<RecycleDeletionsListResult> {
    const cappedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(1000, Math.floor(limit ?? 0)))
      : 300;

    const basePaths = await this.resolveRecycleDeletionBases();
    const entries = await this.collectRecycleDeletionEntries(basePaths);
    entries.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );

    const totalSizeBytes = entries.reduce(
      (sum, entry) => sum + entry.sizeBytes,
      0,
    );
    const visibleEntries = entries.slice(0, cappedLimit);

    return {
      rootsScanned: basePaths,
      totalEntries: entries.length,
      totalSizeBytes,
      truncated: entries.length > visibleEntries.length,
      entries: visibleEntries,
    };
  }

  async purgeRecycleDeletions(
    input: PurgeRecycleDeletionsInput,
  ): Promise<PurgeRecycleDeletionsResult> {
    const basePaths = await this.resolveRecycleDeletionBases();
    const purgeAll = input.purgeAll === true;
    const olderThanDays =
      typeof input.olderThanDays === 'number' &&
      Number.isFinite(input.olderThanDays)
        ? Math.floor(input.olderThanDays)
        : null;

    if (olderThanDays !== null && olderThanDays <= 0) {
      throw new BadRequestException('olderThanDays must be greater than zero.');
    }

    let targetPaths: string[] = [];

    if (purgeAll || olderThanDays !== null) {
      const entries = await this.collectRecycleDeletionEntries(basePaths);

      if (olderThanDays !== null) {
        const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
        targetPaths = entries
          .filter((entry) => Date.parse(entry.updatedAt) <= cutoffMs)
          .map((entry) => entry.folderPath);
      } else {
        targetPaths = entries.map((entry) => entry.folderPath);
      }
    } else {
      targetPaths = normalizeRecycleOperationPaths(input.operationPaths);
      if (targetPaths.length === 0) {
        throw new BadRequestException(
          'Provide operationPaths, olderThanDays, or purgeAll.',
        );
      }
    }

    const dedupedTargetPaths = normalizeRecycleOperationPaths(targetPaths);
    const results: PurgeRecycleDeletionsResultItem[] = [];
    let deleted = 0;
    let failed = 0;
    let reclaimedBytes = 0;

    for (const folderPath of dedupedTargetPaths) {
      const resolvedPath = resolve(folderPath);

      if (!isValidRecycleOperationPath(resolvedPath, basePaths)) {
        failed += 1;
        results.push({
          folderPath: resolvedPath,
          success: false,
          reclaimedBytes: 0,
          error:
            'Path is not a valid recycle operation directory under configured media roots.',
        });
        continue;
      }

      if (!(await this.mediaFsFileOpsService.pathExists(resolvedPath))) {
        results.push({
          folderPath: resolvedPath,
          success: true,
          reclaimedBytes: 0,
        });
        continue;
      }

      try {
        const directoryStats = await stat(resolvedPath);
        if (!directoryStats.isDirectory()) {
          throw new Error('Target path is not a directory.');
        }

        const summary = await this.summarizeRecycleOperation(resolvedPath);

        await rm(resolvedPath, { recursive: true, force: false });
        deleted += 1;
        reclaimedBytes += summary.sizeBytes;

        results.push({
          folderPath: resolvedPath,
          success: true,
          reclaimedBytes: summary.sizeBytes,
        });

        const recycleCategoryPath = dirname(resolvedPath);
        const recycleRootPath = dirname(recycleCategoryPath);
        await this.removeDirectoryIfEmpty(recycleCategoryPath);
        await this.removeDirectoryIfEmpty(recycleRootPath);
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          folderPath: resolvedPath,
          success: false,
          reclaimedBytes: 0,
          error: message,
        });
      }
    }

    const requested = dedupedTargetPaths.length;
    const message = buildRecyclePurgeMessage({
      deleted,
      failed,
      requested,
      reclaimedBytes,
    });

    return {
      requested,
      deleted,
      failed,
      reclaimedBytes,
      results,
      message,
    };
  }

  private async resolveRecycleDeletionBases(): Promise<string[]> {
    const scanLocations =
      await this.mediaLibraryLocationsService.resolveScanLocations();
    const driveRoots = collectDriveRoots(scanLocations);

    return driveRoots
      .map((driveRoot) =>
        resolve(
          join(
            driveRoot,
            this.recycleRootFolderName,
            this.recycleDeleteCategoryName,
          ),
        ),
      )
      .filter((value, index, all) => all.indexOf(value) === index);
  }

  private async collectRecycleDeletionEntries(
    basePaths: readonly string[],
  ): Promise<RecycleDeletionEntry[]> {
    const entries: RecycleDeletionEntry[] = [];

    for (const basePath of basePaths) {
      const resolvedBasePath = resolve(basePath);
      let directoryEntries: Dirent[] = [];

      try {
        directoryEntries = await readdir(resolvedBasePath, {
          withFileTypes: true,
        });
      } catch {
        continue;
      }

      for (const entry of directoryEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const operationPath = resolve(resolvedBasePath, entry.name);

        try {
          const operationStats = await stat(operationPath);
          if (!operationStats.isDirectory()) {
            continue;
          }

          const operationSummary =
            await this.summarizeRecycleOperation(operationPath);
          const driveRoot = parse(resolvedBasePath).root || resolvedBasePath;

          entries.push({
            operationId: entry.name,
            driveRoot,
            folderPath: operationPath,
            createdAt:
              operationStats.birthtimeMs > 0
                ? new Date(operationStats.birthtimeMs).toISOString()
                : null,
            updatedAt: new Date(
              Math.max(operationStats.mtimeMs, operationStats.ctimeMs),
            ).toISOString(),
            sizeBytes: operationSummary.sizeBytes,
            fileCount: operationSummary.fileCount,
          });
        } catch {
          continue;
        }
      }
    }

    return entries;
  }

  private async summarizeRecycleOperation(operationPath: string): Promise<{
    sizeBytes: number;
    fileCount: number;
  }> {
    const pendingDirectories = [operationPath];
    let sizeBytes = 0;
    let fileCount = 0;

    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.pop();
      if (!currentDirectory) {
        continue;
      }

      let entries: Dirent[] = [];
      try {
        entries = await readdir(currentDirectory, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = resolve(currentDirectory, entry.name);

        if (entry.isDirectory()) {
          pendingDirectories.push(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        try {
          const fileStats = await stat(fullPath);
          if (!fileStats.isFile()) {
            continue;
          }

          fileCount += 1;
          sizeBytes += fileStats.size;
        } catch {
          continue;
        }
      }
    }

    return { sizeBytes, fileCount };
  }

  private async removeDirectoryIfEmpty(directoryPath: string): Promise<void> {
    try {
      const entries = await readdir(directoryPath);
      if (entries.length === 0) {
        await rm(directoryPath, { recursive: false, force: false });
      }
    } catch {
      // Best-effort cleanup only.
    }
  }
}
