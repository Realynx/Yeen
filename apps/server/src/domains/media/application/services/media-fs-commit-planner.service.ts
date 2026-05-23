import { Injectable } from '@nestjs/common';
import { readdir, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
  sep,
} from 'node:path';
import { MediaItem } from '../../domain/entities/media-item.entity.ts/media-item.entity';
import { MediaLocationsStore } from '../../infrastructure/stores/media-locations.store';
import { CommitPlan, PlannedMediaChange } from '../types/media-fs-commit.types';

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

@Injectable()
export class MediaFsCommitPlannerService {
  constructor(private readonly mediaLocationsStore: MediaLocationsStore) {}

  async buildPlan(items: MediaItem[]): Promise<CommitPlan> {
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
        if (nfoPath) {
          nfoTotal += 1;
        }
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

  async matchLibraryRoot(filePath: string): Promise<string | null> {
    const locations = await this.getResolvedLocations();
    return this.matchLibraryRootSync(filePath, locations);
  }

  buildNfoPath(targetPath: string): string {
    const ext = extname(targetPath);
    return targetPath.slice(0, targetPath.length - ext.length) + '.nfo';
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
      if (!seriesName) {
        return null;
      }
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
    // Replace characters illegal on Windows and strip control characters.
    const withoutIllegalChars = value.replace(/[\\/:*?"<>|]/g, ' ');
    const withoutControlChars = [...withoutIllegalChars]
      .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
      .join('');

    return (
      withoutControlChars
        .replace(/\s+/g, ' ')
        .trim()
        // Trim trailing dots/spaces (illegal on Windows).
        .replace(/[. ]+$/g, '')
    );
  }

  private pad2(value: number): string {
    return Math.max(0, Math.floor(value)).toString().padStart(2, '0');
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
      if (entry === basename(currentMainPath)) {
        continue;
      }
      const fullFrom = join(dir, entry);

      let entryStat;
      try {
        entryStat = await stat(fullFrom);
      } catch {
        continue;
      }
      if (!entryStat.isFile()) {
        continue;
      }

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
        out.push({
          from: fullFrom,
          to: join(targetDir, `${targetStem}${suffix}`),
        });
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
    if (!isAbsolute(filePath)) {
      return null;
    }

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
}
