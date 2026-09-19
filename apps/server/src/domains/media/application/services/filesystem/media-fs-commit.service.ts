import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import {
  ChainRollbackResult,
  CommitLogEntry,
  CommitOperation,
  CommitSummary,
  MediaCommitStore,
} from '../../../infrastructure/stores/media-commit.store';
import { MediaFsCommitPlannerService } from './media-fs-commit-planner.service';
import { MediaFsFileOpsService } from './media-fs-file-ops.service';
import { MediaFsNfoService } from './media-fs-nfo.service';
import {
  CommitPlan,
  CommitResult,
  RollbackResult,
} from '../../types/media-fs-commit.types';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaFsRollbackService } from './media-fs-rollback.service';
import {
  METADATA_COMMIT_PARTICIPANTS,
  MetadataCommitParticipantRegistry,
} from '../../../../core/application/extensions/metadata-commit-participant';

export type {
  CommitPlan,
  CommitResult,
  PlannedMediaChange,
  PlannedOperation,
  RollbackResult,
} from '../../types/media-fs-commit.types';

@Injectable()
export class MediaFsCommitService {
  private readonly logger = new Logger(MediaFsCommitService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly commitStore: MediaCommitStore,
    private readonly planner: MediaFsCommitPlannerService,
    private readonly fileOps: MediaFsFileOpsService,
    private readonly nfoService: MediaFsNfoService,
    private readonly rollbackService: MediaFsRollbackService,
    @Inject(METADATA_COMMIT_PARTICIPANTS)
    private readonly commitParticipants: MetadataCommitParticipantRegistry,
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

    const preparedParticipants = await this.commitParticipants.prepare(plan);
    let result: CommitResult;
    try {
      result = await this.executeCommitPlan(plan, writeNfo);
    } catch (error) {
      await this.commitParticipants.abort(preparedParticipants, error);
      throw error;
    }

    const integrationWarnings = await this.commitParticipants.complete(
      preparedParticipants,
      result,
    );
    return integrationWarnings.length > 0
      ? { ...result, integrationWarnings }
      : result;
  }

  private async executeCommitPlan(
    plan: CommitPlan,
    writeNfo: boolean,
  ): Promise<CommitResult> {
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
    return this.rollbackService.rollback(commitId);
  }

  /**
   * Roll back all commits from the newest down to and including
   * `targetCommitId`. Commits that are already rolled back are skipped.
   * Stops as soon as a rollback encounters errors, leaving the system in
   * the last known-good state so the admin can debug from there.
   */
  async rollbackTo(targetCommitId: string): Promise<ChainRollbackResult> {
    return this.rollbackService.rollbackTo(targetCommitId);
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
    await this.mediaStore.clearSeriesAssignmentRules(change.mediaId);
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
