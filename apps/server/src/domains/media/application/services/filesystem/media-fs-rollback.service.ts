import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  ChainRollbackCommitResult,
  ChainRollbackResult,
  CommitOperation,
  MediaCommitStore,
} from '../../../infrastructure/stores/media-commit.store';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaFsFileOpsService } from './media-fs-file-ops.service';
import { RollbackResult } from '../../types/media-fs-commit.types';

@Injectable()
export class MediaFsRollbackService {
  private readonly logger = new Logger(MediaFsRollbackService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly commitStore: MediaCommitStore,
    private readonly fileOps: MediaFsFileOpsService,
  ) {}

  async rollback(commitId: string): Promise<RollbackResult> {
    const entry = await this.commitStore.findById(commitId);
    if (!entry) {
      throw new NotFoundException(`Commit not found: ${commitId}`);
    }
    if (entry.rolledBackAt) {
      throw new BadRequestException(`Commit already rolled back: ${commitId}`);
    }

    const errors: string[] = [];
    let reverted = 0;
    const operations = [...entry.operations].reverse();
    const recycleMap = this.buildRecycleMap(entry.operations);

    for (const op of operations) {
      try {
        reverted += await this.rollbackOperation(op, recycleMap);
      } catch (error) {
        const message = this.toErrorMessage(error);
        errors.push(`${op.type}: ${message}`);
        this.logger.warn(`Rollback step failed (${op.type}): ${message}`);
      }
    }

    await this.commitStore.markRolledBack(
      commitId,
      new Date().toISOString(),
      errors,
    );

    return { commitId, reverted, errors };
  }

  /**
   * Roll back all commits from the newest down to and including
   * `targetCommitId`. Commits that are already rolled back are skipped.
   * Stops as soon as a rollback encounters errors, leaving the system in
   * the last known-good state so the admin can debug from there.
   */
  async rollbackTo(targetCommitId: string): Promise<ChainRollbackResult> {
    const allCommits = await this.commitStore.list(); // newest-first
    const targetIndex = allCommits.findIndex((c) => c.id === targetCommitId);
    if (targetIndex === -1) {
      throw new NotFoundException(`Commit not found: ${targetCommitId}`);
    }

    // Commits to roll back: from newest (index 0) to targetIndex (inclusive),
    // skipping any that are already rolled back.
    const toRollback = allCommits
      .slice(0, targetIndex + 1)
      .filter((c) => !c.rolledBackAt);

    const results: ChainRollbackCommitResult[] = [];
    let completed = 0;
    let failedAt: string | null = null;

    for (const commit of toRollback) {
      try {
        const result = await this.rollback(commit.id);
        const success = result.errors.length === 0;
        results.push({
          commitId: commit.id,
          reverted: result.reverted,
          errors: result.errors,
          success,
        });
        if (success) {
          completed += 1;
        } else {
          // Partial errors: treat as a failure and stop the chain.
          failedAt = commit.id;
          break;
        }
      } catch (error) {
        const message = this.toErrorMessage(error);
        results.push({
          commitId: commit.id,
          reverted: 0,
          errors: [message],
          success: false,
        });
        failedAt = commit.id;
        break;
      }
    }

    return {
      targetCommitId,
      totalToRollback: toRollback.length,
      completed,
      failedAt,
      results,
    };
  }

  private buildRecycleMap(operations: CommitOperation[]): Map<string, string> {
    const recycleMap = new Map<string, string>();
    for (const op of operations) {
      if (op.type === 'recycleSnapshot') {
        recycleMap.set(op.originalPath, op.recyclePath);
      }
    }
    return recycleMap;
  }

  private async rollbackOperation(
    op: CommitOperation,
    recycleMap: Map<string, string>,
  ): Promise<number> {
    if (op.type === 'rename') {
      if (await this.fileOps.pathExists(op.from)) {
        throw new Error(`Original path already occupied: ${op.from}`);
      }

      await mkdir(dirname(op.from), { recursive: true });
      if (await this.fileOps.pathExists(op.to)) {
        await rename(op.to, op.from);
      } else {
        const recycleSrc = recycleMap.get(op.from);
        if (recycleSrc && (await this.fileOps.pathExists(recycleSrc))) {
          await copyFile(recycleSrc, op.from);
          this.logger.warn(
            `Restored from recycle (committed path missing): ${op.from}`,
          );
        } else {
          throw new Error(
            `File missing at committed path and no recycle snapshot: ${op.to}`,
          );
        }
      }

      return 1;
    }

    if (op.type === 'writeNfo') {
      if (await this.fileOps.pathExists(op.path)) {
        await unlink(op.path);
        return 1;
      }
      return 0;
    }

    if (op.type === 'mkdir') {
      await this.fileOps.removeEmptyDir(op.path);
      return 0;
    }

    if (op.type === 'updateDbPath') {
      await this.mediaStore.updateFilePath(op.mediaId, op.from, op.fromRelative);
      return 1;
    }

    return 0;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
