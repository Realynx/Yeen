import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir, rm, unlink } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from 'node:path';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaFsFileOpsService } from '../filesystem/media-fs-file-ops.service';

export interface MediaPermanentDeleteResult {
  mediaId: string;
  title: string;
  success: boolean;
  deletedEntries: number;
}

@Injectable()
export class MediaPermanentDeleteService {
  private readonly sidecarDeleteExtensions = new Set([
    '.srt',
    '.ass',
    '.ssa',
    '.vtt',
    '.sub',
    '.idx',
    '.sup',
    '.nfo',
    '.txt',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ]);
  private readonly subtitleStorageRoot = join(
    process.cwd(),
    'data',
    'subtitles',
  );
  private readonly recycleRootFolderName = '.yeen-recycle';
  private readonly recycleDeleteCategoryName = 'media-deletions';
  private readonly logger = new Logger(MediaPermanentDeleteService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaFsFileOpsService: MediaFsFileOpsService,
  ) {}

  async deleteMediaPermanently(
    mediaId: string,
  ): Promise<MediaPermanentDeleteResult> {
    const item = await this.getById(mediaId);

    if (!isAbsolute(item.filePath)) {
      throw new BadRequestException(
        `Media file path is invalid for ${item.title}.`,
      );
    }

    const deletionTargets = await this.collectDeletionTargets(item);
    const deleteOperationId = randomUUID();
    let deletedEntries = 0;

    for (const targetPath of deletionTargets) {
      try {
        if (
          await this.moveFileToRecycleIfExists(targetPath, deleteOperationId)
        ) {
          deletedEntries += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Recycle move failed for ${targetPath}: ${message}. Falling back to permanent delete.`,
        );

        if (await this.removeFileIfExists(targetPath)) {
          deletedEntries += 1;
        }
      }
    }

    const subtitleFolder = join(this.subtitleStorageRoot, item.id);
    if (await this.removeDirectoryIfExists(subtitleFolder)) {
      deletedEntries += 1;
    }

    await this.removeDirectoryIfEmpty(dirname(resolve(item.filePath)));

    const removedRows = await this.mediaStore.deleteById(item.id);
    if (removedRows === 0) {
      throw new NotFoundException(`Media item not found: ${item.id}`);
    }

    return {
      mediaId: item.id,
      title: item.title,
      success: true,
      deletedEntries,
    };
  }

  private async getById(mediaId: string): Promise<MediaItem> {
    const item = await this.mediaStore.findById(mediaId);
    if (!item) {
      throw new NotFoundException(
        'Media item not found. Scan your library first.',
      );
    }

    return item;
  }

  private async collectDeletionTargets(item: MediaItem): Promise<Set<string>> {
    const targets = new Set<string>();
    const mainPath = resolve(item.filePath);

    targets.add(mainPath);
    targets.add(this.toNfoPath(mainPath));

    const sidecars = await this.findSidecarsForDeletion(mainPath);
    for (const sidecarPath of sidecars) {
      targets.add(sidecarPath);
    }

    for (const subtitle of item.subtitleDetails) {
      if (subtitle.kind !== 'external') {
        continue;
      }
      if (!subtitle.source || !isAbsolute(subtitle.source)) {
        continue;
      }
      targets.add(resolve(subtitle.source));
    }

    if (item.previewImagePath && !this.isRemoteUrl(item.previewImagePath)) {
      targets.add(resolve(item.previewImagePath));
    }

    if (item.backdropImagePath && !this.isRemoteUrl(item.backdropImagePath)) {
      targets.add(resolve(item.backdropImagePath));
    }

    for (const thumbnail of item.chapterThumbnails) {
      if (!thumbnail.imagePath || !isAbsolute(thumbnail.imagePath)) {
        continue;
      }
      targets.add(resolve(thumbnail.imagePath));
    }

    return targets;
  }

  private async findSidecarsForDeletion(mainPath: string): Promise<string[]> {
    const directoryPath = dirname(mainPath);
    const mainFileName = basename(mainPath);
    const mainStem = basename(mainPath, extname(mainPath)).toLowerCase();

    let entries: string[] = [];
    try {
      entries = await readdir(directoryPath);
    } catch {
      return [];
    }

    const out: string[] = [];
    for (const entry of entries) {
      if (entry === mainFileName) {
        continue;
      }

      const extension = extname(entry).toLowerCase();
      if (!this.sidecarDeleteExtensions.has(extension)) {
        continue;
      }

      const entryStem = basename(entry, extension).toLowerCase();
      if (!this.matchesSidecarStem(entryStem, mainStem)) {
        continue;
      }

      out.push(join(directoryPath, entry));
    }

    return out;
  }

  private matchesSidecarStem(candidateStem: string, mainStem: string): boolean {
    return (
      candidateStem === mainStem ||
      candidateStem.startsWith(`${mainStem}.`) ||
      candidateStem.startsWith(`${mainStem}-`) ||
      candidateStem.startsWith(`${mainStem}_`) ||
      candidateStem.startsWith(`${mainStem} `)
    );
  }

  private toNfoPath(mainPath: string): string {
    const extension = extname(mainPath);
    if (!extension) {
      return `${mainPath}.nfo`;
    }
    return mainPath.slice(0, mainPath.length - extension.length) + '.nfo';
  }

  private async moveFileToRecycleIfExists(
    filePath: string,
    deleteOperationId: string,
  ): Promise<boolean> {
    if (!(await this.mediaFsFileOpsService.pathExists(filePath))) {
      return false;
    }

    const recyclePath = await this.resolveUniqueRecyclePath(
      filePath,
      deleteOperationId,
    );
    await this.mediaFsFileOpsService.moveFile(filePath, recyclePath);
    return true;
  }

  private async resolveUniqueRecyclePath(
    sourcePath: string,
    deleteOperationId: string,
  ): Promise<string> {
    const preferredPath = this.buildRecyclePath(sourcePath, deleteOperationId);
    if (!(await this.mediaFsFileOpsService.pathExists(preferredPath))) {
      return preferredPath;
    }

    const extension = extname(preferredPath);
    const withoutExtension = extension
      ? preferredPath.slice(0, preferredPath.length - extension.length)
      : preferredPath;

    for (let counter = 1; counter <= 1000; counter += 1) {
      const candidate = `${withoutExtension}.${counter}${extension}`;
      if (!(await this.mediaFsFileOpsService.pathExists(candidate))) {
        return candidate;
      }
    }

    return `${withoutExtension}.${randomUUID()}${extension}`;
  }

  private buildRecyclePath(
    sourcePath: string,
    deleteOperationId: string,
  ): string {
    const absolutePath = resolve(sourcePath);
    const parsed = parse(absolutePath);
    const rootPath = parsed.root;

    if (!rootPath) {
      return join(
        dirname(absolutePath),
        this.recycleRootFolderName,
        this.recycleDeleteCategoryName,
        deleteOperationId,
        basename(absolutePath),
      );
    }

    const relativeToRoot = relative(rootPath, absolutePath);
    const safeRelative =
      relativeToRoot &&
      !relativeToRoot.startsWith('..') &&
      !isAbsolute(relativeToRoot)
        ? relativeToRoot
        : basename(absolutePath);

    return join(
      rootPath,
      this.recycleRootFolderName,
      this.recycleDeleteCategoryName,
      deleteOperationId,
      safeRelative,
    );
  }

  private async removeFileIfExists(filePath: string): Promise<boolean> {
    try {
      await unlink(filePath);
      return true;
    } catch (error) {
      if (this.isMissingPathError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async removeDirectoryIfExists(
    directoryPath: string,
  ): Promise<boolean> {
    try {
      await rm(directoryPath, { recursive: true, force: false });
      return true;
    } catch (error) {
      if (this.isMissingPathError(error)) {
        return false;
      }
      throw error;
    }
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

  private isMissingPathError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    );
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }
}
