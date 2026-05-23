import { Injectable } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { CommitOperation } from '../../../infrastructure/stores/media-commit.store';

const DEFAULT_MOVE_CHUNK_BYTES = 8 * 1024 * 1024;

@Injectable()
export class MediaFsFileOpsService {
  async pathExists(target: string): Promise<boolean> {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Recursively ensure each directory in the chain exists, returning
   * mkdir operations for each directory we actually created (so rollback
   * can remove only the directories it owns).
   */
  async ensureDirectories(targetDir: string): Promise<CommitOperation[]> {
    const segments: string[] = [];
    let current = targetDir;
    while (current && !(await this.pathExists(current))) {
      segments.unshift(current);
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    const ops: CommitOperation[] = [];
    for (const segment of segments) {
      await mkdir(segment, { recursive: false });
      ops.push({ type: 'mkdir', path: segment });
    }

    return ops;
  }

  async removeEmptyDir(target: string): Promise<void> {
    try {
      const entries = await readdir(target);
      if (entries.length === 0) {
        await rmdir(target);
      }
    } catch {
      // Ignore; non-fatal.
    }
  }

  /**
   * Move a file to a new path. Uses a same-volume rename when possible and
   * falls back to chunked copy+delete for cross-device moves.
   */
  async moveFile(
    sourcePath: string,
    targetPath: string,
    options: { chunkSizeBytes?: number } = {},
  ): Promise<void> {
    const chunkSizeBytes = Number.isFinite(options.chunkSizeBytes)
      ? Math.max(64 * 1024, Math.floor(options.chunkSizeBytes ?? 0))
      : DEFAULT_MOVE_CHUNK_BYTES;

    await mkdir(dirname(targetPath), { recursive: true });

    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (!this.isCrossDeviceRenameError(error)) {
        throw error;
      }
    }

    await this.copyFileInChunks(sourcePath, targetPath, chunkSizeBytes);
    await unlink(sourcePath);
  }

  /**
   * Copy sourcePath into recycleDir, preserving a relative structure
   * derived from the library root. Returns the full path of the recycle copy.
   */
  async recycleFile(
    sourcePath: string,
    recycleDir: string,
    libraryRoot: string,
  ): Promise<string> {
    const rel = isAbsolute(sourcePath)
      ? relative(libraryRoot, sourcePath)
      : basename(sourcePath);
    const dest = join(recycleDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(sourcePath, dest);
    return dest;
  }

  private async copyFileInChunks(
    sourcePath: string,
    targetPath: string,
    chunkSizeBytes: number,
  ): Promise<void> {
    if (await this.pathExists(targetPath)) {
      throw new Error(`Target already exists: ${targetPath}`);
    }

    try {
      await pipeline(
        createReadStream(sourcePath, {
          highWaterMark: chunkSizeBytes,
        }),
        createWriteStream(targetPath, {
          flags: 'wx',
        }),
      );
    } catch (error) {
      // Best effort cleanup when cross-device copy fails midway.
      try {
        await unlink(targetPath);
      } catch {
        // Ignore cleanup failures.
      }
      throw error;
    }
  }

  private isCrossDeviceRenameError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'EXDEV'
    );
  }
}
