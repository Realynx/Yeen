import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { MediaItem } from './entities/media-item.entity';
import {
  CommitLogEntry,
  CommitOperation,
  CommitSummary,
  MediaCommitStore,
  ChainRollbackCommitResult,
  ChainRollbackResult,
} from './media-commit.store';
import { MediaLocationsStore } from './media-locations.store';
import { MediaStore } from './media.store';

const SIDECAR_EXTENSIONS = new Set([
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

const COMPANION_FILENAMES = new Set([
  'poster.jpg',
  'poster.png',
  'fanart.jpg',
  'fanart.png',
  'banner.jpg',
  'banner.png',
  'folder.jpg',
  'folder.png',
  'thumb.jpg',
  'thumb.png',
]);

/** Root directory where per-commit recycle snapshots are stored. */
const RECYCLE_BASE_DIR = join(process.cwd(), 'data', 'recycle');

export interface PlannedOperation {
  type: CommitOperation['type'];
  mediaId?: string;
  from?: string;
  to?: string;
  path?: string;
  role?: 'main' | 'sidecar';
}

export interface PlannedMediaChange {
  mediaId: string;
  title: string;
  type: MediaItem['type'];
  currentPath: string;
  targetPath: string;
  willMove: boolean;
  sidecars: Array<{ from: string; to: string }>;
  nfoPath: string | null;
  reason?: string;
  skipped?: boolean;
}

export interface CommitPlan {
  changes: PlannedMediaChange[];
  skipped: PlannedMediaChange[];
  summary: {
    totalItems: number;
    movableItems: number;
    skippedItems: number;
    sidecars: number;
    nfoFiles: number;
  };
}

export interface CommitResult {
  commitId: string;
  summary: CommitSummary;
  changes: Array<{
    mediaId: string;
    title: string;
    from: string;
    to: string;
    sidecarCount: number;
    nfoWritten: boolean;
    error?: string;
  }>;
}

export interface RollbackResult {
  commitId: string;
  reverted: number;
  errors: string[];
}

@Injectable()
export class MediaFsCommitService {
  private readonly logger = new Logger(MediaFsCommitService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly commitStore: MediaCommitStore,
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
    const recycleDir = join(RECYCLE_BASE_DIR, commitId);
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
        const item = await this.mediaStore.findById(change.mediaId);
        if (!item) {
          throw new Error(`Media not found in store: ${change.mediaId}`);
        }

        const libraryRoot = await this.matchLibraryRoot(item.filePath);
        if (!libraryRoot) {
          throw new Error(
            `No configured media location matched: ${item.filePath}`,
          );
        }

        // Pre-flight: target must not exist (unless equal to current).
        if (
          change.targetPath !== change.currentPath &&
          (await this.pathExists(change.targetPath))
        ) {
          throw new Error(`Target already exists: ${change.targetPath}`);
        }

        // Snapshot main file into recycle dir before moving it.
        const mainRecyclePath = await this.recycleFile(
          change.currentPath,
          recycleDir,
          libraryRoot,
        );
        operations.push({
          type: 'recycleSnapshot',
          originalPath: change.currentPath,
          recyclePath: mainRecyclePath,
        });

        // Snapshot sidecars into recycle dir before moving them.
        for (const sidecar of change.sidecars) {
          if (await this.pathExists(sidecar.from)) {
            const sidecarRecyclePath = await this.recycleFile(
              sidecar.from,
              recycleDir,
              libraryRoot,
            );
            operations.push({
              type: 'recycleSnapshot',
              originalPath: sidecar.from,
              recyclePath: sidecarRecyclePath,
            });
          }
        }

        // Ensure target directory chain exists, recording mkdir ops.
        const dirOps = await this.ensureDirectories(
          dirname(change.targetPath),
        );
        operations.push(...dirOps);
        summary.directoriesCreated += dirOps.length;

        // Move main file.
        await rename(change.currentPath, change.targetPath);
        operations.push({
          type: 'rename',
          mediaId: change.mediaId,
          from: change.currentPath,
          to: change.targetPath,
          role: 'main',
        });
        summary.filesRenamed += 1;

        // Move sidecars.
        let sidecarCount = 0;
        for (const sidecar of change.sidecars) {
          if (await this.pathExists(sidecar.to)) {
            // Skip if target sidecar somehow already exists; non-fatal.
            this.logger.warn(
              `Skipping sidecar move (target exists): ${sidecar.to}`,
            );
            continue;
          }
          await rename(sidecar.from, sidecar.to);
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

        // Update DB.
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

        // Write NFO sidecar.
        let nfoWritten = false;
        if (writeNfo && change.nfoPath) {
          const nfoXml = this.buildNfoXml(item);
          if (nfoXml) {
            await writeFile(change.nfoPath, nfoXml, 'utf8');
            operations.push({ type: 'writeNfo', path: change.nfoPath });
            summary.nfoFilesWritten += 1;
            nfoWritten = true;
          }
        }

        // Attempt to remove now-empty original directory.
        await this.removeEmptyDir(dirname(change.currentPath));

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
        const message =
          error instanceof Error ? error.message : 'Unknown error';
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
      recycleDir,
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

    // Build recycle lookup: originalPath → recyclePath for this commit.
    const recycleMap = new Map<string, string>();
    for (const op of entry.operations) {
      if (op.type === 'recycleSnapshot') {
        recycleMap.set(op.originalPath, op.recyclePath);
      }
    }

    for (const op of operations) {
      try {
        if (op.type === 'rename') {
          if (await this.pathExists(op.from)) {
            // Original location is occupied; cannot safely restore.
            throw new Error(`Original path already occupied: ${op.from}`);
          }
          await mkdir(dirname(op.from), { recursive: true });
          if (await this.pathExists(op.to)) {
            // Normal path: file is still at the committed location.
            await rename(op.to, op.from);
          } else {
            // File no longer at committed path — try restoring from recycle.
            const recycleSrc = recycleMap.get(op.from);
            if (recycleSrc && (await this.pathExists(recycleSrc))) {
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
          reverted += 1;
        } else if (op.type === 'writeNfo') {
          if (await this.pathExists(op.path)) {
            await unlink(op.path);
            reverted += 1;
          }
        } else if (op.type === 'mkdir') {
          await this.removeEmptyDir(op.path);
        } else if (op.type === 'updateDbPath') {
          await this.mediaStore.updateFilePath(
            op.mediaId,
            op.from,
            op.fromRelative,
          );
          reverted += 1;
        }
        // recycleSnapshot ops are informational only; no action needed.
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
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

  // ---------- Planning helpers ----------

  private async buildPlan(items: MediaItem[]): Promise<CommitPlan> {
    const locations = await this.getResolvedLocations();
    const targetCollisions = new Set<string>();
    const planned: PlannedMediaChange[] = [];
    const skipped: PlannedMediaChange[] = [];

    let movableItems = 0;
    let sidecarTotal = 0;
    let nfoTotal = 0;

    for (const item of items) {
      const libraryRoot = this.matchLibraryRootSync(item.filePath, locations);
      if (!libraryRoot) {
        skipped.push(
          this.toSkippedChange(
            item,
            'File is not inside a configured media location.',
          ),
        );
        continue;
      }

      const targetRelative = this.buildTargetRelativePath(item);
      if (!targetRelative) {
        skipped.push(
          this.toSkippedChange(
            item,
            item.type === 'show'
              ? 'Show is missing season/episode number.'
              : 'Item is missing metadata required for auto-organization.',
          ),
        );
        continue;
      }

      const targetPath = resolve(libraryRoot, targetRelative);
      const willMove = targetPath !== resolve(item.filePath);

      // Detect collisions inside this plan batch.
      if (willMove && targetCollisions.has(targetPath.toLowerCase())) {
        skipped.push(
          this.toSkippedChange(
            item,
            `Conflicting target path with another item: ${targetPath}`,
          ),
        );
        continue;
      }
      if (willMove) {
        targetCollisions.add(targetPath.toLowerCase());
      }

      const sidecars = willMove
        ? await this.discoverSidecars(item.filePath, targetPath)
        : [];

      const nfoPath = this.buildNfoPath(targetPath);

      const change: PlannedMediaChange = {
        mediaId: item.id,
        title: item.title,
        type: item.type,
        currentPath: item.filePath,
        targetPath,
        willMove,
        sidecars,
        nfoPath,
      };

      planned.push(change);
      if (willMove) {
        movableItems += 1;
        sidecarTotal += sidecars.length;
        if (nfoPath) nfoTotal += 1;
      }
    }

    return {
      changes: planned,
      skipped,
      summary: {
        totalItems: items.length,
        movableItems,
        skippedItems: skipped.length,
        sidecars: sidecarTotal,
        nfoFiles: nfoTotal,
      },
    };
  }

  private toSkippedChange(item: MediaItem, reason: string): PlannedMediaChange {
    return {
      mediaId: item.id,
      title: item.title,
      type: item.type,
      currentPath: item.filePath,
      targetPath: item.filePath,
      willMove: false,
      sidecars: [],
      nfoPath: null,
      reason,
      skipped: true,
    };
  }

  private buildTargetRelativePath(item: MediaItem): string | null {
    const ext = (extname(item.filePath) || item.extension || '').toLowerCase();
    if (item.type === 'movie' || item.type === 'other') {
      const folderName = this.movieFolderName(item);
      const fileName = `${folderName}${ext}`;
      return join(folderName, fileName);
    }
    if (item.type === 'show') {
      if (
        item.seasonNumber === null ||
        item.episodeNumber === null ||
        item.seasonNumber === undefined ||
        item.episodeNumber === undefined
      ) {
        return null;
      }
      const seriesName = this.safePathSegment(item.title);
      if (!seriesName) return null;
      const seasonFolder = `Season ${this.pad2(item.seasonNumber)}`;
      const seCode = `S${this.pad2(item.seasonNumber)}E${this.pad2(item.episodeNumber)}`;
      const episodeTitle = item.episodeTitle
        ? ` - ${this.safePathSegment(item.episodeTitle)}`
        : '';
      const fileName = `${seriesName} - ${seCode}${episodeTitle}${ext}`;
      return join(seriesName, seasonFolder, fileName);
    }
    return null;
  }

  private movieFolderName(item: MediaItem): string {
    const baseTitle = this.safePathSegment(item.title) || 'Untitled';
    if (item.releaseYear && Number.isFinite(item.releaseYear)) {
      return `${baseTitle} (${item.releaseYear})`;
    }
    return baseTitle;
  }

  private safePathSegment(value: string): string {
    // Replace characters illegal on Windows + control chars, collapse whitespace.
    const cleaned = value
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // Trim trailing dots/spaces (illegal on Windows).
      .replace(/[. ]+$/g, '');
    return cleaned;
  }

  private pad2(value: number): string {
    return Math.max(0, Math.floor(value)).toString().padStart(2, '0');
  }

  private buildNfoPath(targetPath: string): string {
    const ext = extname(targetPath);
    return targetPath.slice(0, targetPath.length - ext.length) + '.nfo';
  }

  private async discoverSidecars(
    currentMainPath: string,
    targetMainPath: string,
  ): Promise<Array<{ from: string; to: string }>> {
    const dir = dirname(currentMainPath);
    const mainExt = extname(currentMainPath);
    const mainStem = basename(currentMainPath, mainExt);
    const targetDir = dirname(targetMainPath);
    const targetExt = extname(targetMainPath);
    const targetStem = basename(targetMainPath, targetExt);

    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const out: Array<{ from: string; to: string }> = [];
    for (const entry of entries) {
      if (entry === basename(currentMainPath)) continue;
      const fullFrom = join(dir, entry);

      let entryStat;
      try {
        entryStat = await stat(fullFrom);
      } catch {
        continue;
      }
      if (!entryStat.isFile()) continue;

      const entryExt = extname(entry).toLowerCase();
      const entryStem = basename(entry, extname(entry));
      const lowerEntry = entry.toLowerCase();

      // Same-stem sidecars: e.g. Movie.srt, Movie.en.srt
      if (
        entryStem === mainStem ||
        entryStem.startsWith(`${mainStem}.`) ||
        entryStem.startsWith(`${mainStem} `)
      ) {
        const suffix = entry.slice(mainStem.length); // includes leading . or space
        out.push({ from: fullFrom, to: join(targetDir, `${targetStem}${suffix}`) });
        continue;
      }

      // Companion artwork at folder level.
      if (
        SIDECAR_EXTENSIONS.has(entryExt) &&
        COMPANION_FILENAMES.has(lowerEntry)
      ) {
        out.push({ from: fullFrom, to: join(targetDir, entry) });
      }
    }
    return out;
  }

  // ---------- IO helpers ----------

  private async getResolvedLocations(): Promise<string[]> {
    const locations = await this.mediaLocationsStore.all();
    return locations
      .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => resolve(entry));
  }

  private matchLibraryRootSync(
    filePath: string,
    locations: string[],
  ): string | null {
    if (!isAbsolute(filePath)) return null;
    const absolute = resolve(filePath);
    const lower = absolute.toLowerCase();
    let best: string | null = null;
    for (const root of locations) {
      const rootLower = root.toLowerCase();
      const withSep = rootLower.endsWith(sep) ? rootLower : rootLower + sep;
      if (lower === rootLower || lower.startsWith(withSep)) {
        if (!best || root.length > best.length) {
          best = root;
        }
      }
    }
    return best;
  }

  private async matchLibraryRoot(filePath: string): Promise<string | null> {
    const locations = await this.getResolvedLocations();
    return this.matchLibraryRootSync(filePath, locations);
  }

  private async pathExists(target: string): Promise<boolean> {
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
  private async ensureDirectories(
    targetDir: string,
  ): Promise<CommitOperation[]> {
    const segments: string[] = [];
    let current = targetDir;
    while (current && !(await this.pathExists(current))) {
      segments.unshift(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const ops: CommitOperation[] = [];
    for (const segment of segments) {
      await mkdir(segment, { recursive: false });
      ops.push({ type: 'mkdir', path: segment });
    }
    return ops;
  }

  private async removeEmptyDir(target: string): Promise<void> {
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
   * Copy `sourcePath` into `recycleDir`, preserving a relative structure
   * derived from the library root. Returns the full path of the recycle copy.
   */
  private async recycleFile(
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

  // ---------- NFO writers ----------

  private buildNfoXml(item: MediaItem): string | null {
    if (item.type === 'movie') {
      return this.wrapXml(
        'movie',
        [
          this.xmlTag('title', item.title),
          item.releaseYear ? this.xmlTag('year', String(item.releaseYear)) : '',
          item.description ? this.xmlTag('plot', item.description) : '',
          ...item.tags.map((tag) => this.xmlTag('tag', tag)),
        ].filter(Boolean),
      );
    }
    if (item.type === 'show') {
      return this.wrapXml(
        'episodedetails',
        [
          this.xmlTag(
            'title',
            item.episodeTitle && item.episodeTitle.trim()
              ? item.episodeTitle
              : item.title,
          ),
          this.xmlTag('showtitle', item.title),
          item.seasonNumber !== null
            ? this.xmlTag('season', String(item.seasonNumber))
            : '',
          item.episodeNumber !== null
            ? this.xmlTag('episode', String(item.episodeNumber))
            : '',
          item.releaseYear ? this.xmlTag('year', String(item.releaseYear)) : '',
          item.description ? this.xmlTag('plot', item.description) : '',
          ...item.tags.map((tag) => this.xmlTag('tag', tag)),
        ].filter(Boolean),
      );
    }
    return null;
  }

  private wrapXml(root: string, lines: string[]): string {
    const body = lines.map((line) => `  ${line}`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root}>\n${body}\n</${root}>\n`;
  }

  private xmlTag(name: string, value: string): string {
    return `<${name}>${this.xmlEscape(value)}</${name}>`;
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
