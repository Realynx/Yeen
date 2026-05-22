import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';
import { MediaItem } from './entities/media-item.entity';
import {
  ChainRollbackCommitResult,
  ChainRollbackResult,
  CommitLogEntry,
  CommitOperation,
  CommitSummary,
  MediaCommitStore,
} from './media-commit.store';
import { MediaFsCommitPlannerService } from './media-fs-commit-planner.service';
import { MediaFsFileOpsService } from './media-fs-file-ops.service';
import { MediaFsNfoService } from './media-fs-nfo.service';
import {
  CommitPlan,
  CommitResult,
  RollbackResult,
} from './media-fs-commit.types';
import { MediaStore } from './media.store';

export type {
  CommitPlan,
  CommitResult,
  PlannedMediaChange,
  PlannedOperation,
  RollbackResult,
} from './media-fs-commit.types';

@Injectable()
export class MediaFsCommitService {
  private readonly logger = new Logger(MediaFsCommitService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly commitStore: MediaCommitStore,
    private readonly planner: MediaFsCommitPlannerService,
    private readonly fileOps: MediaFsFileOpsService,
    private readonly nfoService: MediaFsNfoService,
  ) {}

  async planAll(): Promise<CommitPlan> {
    const items = await this.mediaStore.all();
    return this.buildPlan(items);
  }

  async planByIds(mediaIds: string[]): Promise<CommitPlan> {
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      throw new BadRequestException('mediaIds must contain at least one id.');
    }
    const items: MediaItem[] = [];
    for (const id of mediaIds) {
      const item = await this.mediaStore.findById(id);
      if (!item) {
        throw new NotFoundException(`Media item not found: ${id}`);
      }
      items.push(item);
    }
    return this.buildPlan(items);
  }

  async commit(input: {
    mediaIds?: string[];
    writeNfo?: boolean;
  }): Promise<CommitResult> {
    const writeNfo = input.writeNfo !== false;
    const plan =
      input.mediaIds && input.mediaIds.length > 0
        ? await this.planByIds(input.mediaIds)
        : await this.planAll();

    const commitId = randomUUID();
    const operations: CommitOperation[] = [];
    const summary: CommitSummary = {
      totalItems: plan.changes.length,
      filesRenamed: 0,
      sidecarsMoved: 0,
      nfoFilesWritten: 0,
      directoriesCreated: 0,
      errors: 0,
    };
    const reportChanges: CommitResult['changes'] = [];

    for (const change of plan.changes) {
      if (!change.willMove) {
        continue;
      }

      try {
        const { sidecarCount, nfoWritten } = await this.applyCommitChange(
          change,
          writeNfo,
          operations,
          summary,
        );

        reportChanges.push({
          mediaId: change.mediaId,
          title: change.title,
          from: change.currentPath,
          to: change.targetPath,
          sidecarCount,
          nfoWritten,
        });
      } catch (error) {
        summary.errors += 1;
        const message = this.toErrorMessage(error);
        this.logger.error(
          `Failed to commit media ${change.mediaId}: ${message}`,
        );
        reportChanges.push({
          mediaId: change.mediaId,
          title: change.title,
          from: change.currentPath,
          to: change.targetPath,
          sidecarCount: 0,
          nfoWritten: false,
          error: message,
        });
      }
    }

    const entry: CommitLogEntry = {
      id: commitId,
      createdAt: new Date().toISOString(),
      summary,
      operations,
      rolledBackAt: null,
    };
    await this.commitStore.append(entry);

    return {
      commitId,
      summary,
      changes: reportChanges,
    };
  }

  async listCommits(): Promise<CommitLogEntry[]> {
    return this.commitStore.list();
  }

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
        const message =
          error instanceof Error ? error.message : 'Unknown error';
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

  private async applyCommitChange(
    change: CommitPlan['changes'][number],
    writeNfo: boolean,
    operations: CommitOperation[],
    summary: CommitSummary,
  ): Promise<{ sidecarCount: number; nfoWritten: boolean }> {
    const item = await this.mediaStore.findById(change.mediaId);
    if (!item) {
      throw new Error(`Media not found in store: ${change.mediaId}`);
    }

    const libraryRoot = await this.matchLibraryRoot(item.filePath);
    if (!libraryRoot) {
      throw new Error(`No configured media location matched: ${item.filePath}`);
    }

    if (
      change.targetPath !== change.currentPath &&
      (await this.fileOps.pathExists(change.targetPath))
    ) {
      throw new Error(`Target already exists: ${change.targetPath}`);
    }

    const dirOps = await this.fileOps.ensureDirectories(
      dirname(change.targetPath),
    );
    operations.push(...dirOps);
    summary.directoriesCreated += dirOps.length;

    await this.fileOps.moveFile(change.currentPath, change.targetPath);
    operations.push({
      type: 'rename',
      mediaId: change.mediaId,
      from: change.currentPath,
      to: change.targetPath,
      role: 'main',
    });
    summary.filesRenamed += 1;

    let sidecarCount = 0;
    for (const sidecar of change.sidecars) {
      if (await this.fileOps.pathExists(sidecar.to)) {
        this.logger.warn(
          `Skipping sidecar move (target exists): ${sidecar.to}`,
        );
        continue;
      }

      await this.fileOps.moveFile(sidecar.from, sidecar.to);
      operations.push({
        type: 'rename',
        mediaId: change.mediaId,
        from: sidecar.from,
        to: sidecar.to,
        role: 'sidecar',
      });
      summary.sidecarsMoved += 1;
      sidecarCount += 1;
    }

    const newRelative = relative(libraryRoot, change.targetPath)
      .split(sep)
      .join('/');
    const oldRelative = item.relativePath;
    await this.mediaStore.updateFilePath(
      change.mediaId,
      change.targetPath,
      newRelative,
    );
    operations.push({
      type: 'updateDbPath',
      mediaId: change.mediaId,
      from: change.currentPath,
      to: change.targetPath,
      fromRelative: oldRelative,
      toRelative: newRelative,
    });

    let nfoWritten = false;
    if (writeNfo && change.nfoPath) {
      const nfoXml = this.nfoService.buildNfoXml(item);
      if (nfoXml) {
        await writeFile(change.nfoPath, nfoXml, 'utf8');
        operations.push({ type: 'writeNfo', path: change.nfoPath });
        summary.nfoFilesWritten += 1;
        nfoWritten = true;
      }
    }

    await this.fileOps.removeEmptyDir(dirname(change.currentPath));

    return { sidecarCount, nfoWritten };
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
      await this.mediaStore.updateFilePath(
        op.mediaId,
        op.from,
        op.fromRelative,
      );
      return 1;
    }

    return 0;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  // ---------- Planning helpers ----------

  private async buildPlan(items: MediaItem[]): Promise<CommitPlan> {
    return this.planner.buildPlan(items);
  }

  private async matchLibraryRoot(filePath: string): Promise<string | null> {
    return this.planner.matchLibraryRoot(filePath);
  }
}
