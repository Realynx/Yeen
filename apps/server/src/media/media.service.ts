import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { readdir, rm, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
import { lookup } from 'mime-types';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MediaAiMetadataService } from './media-ai-metadata.service';
import { MediaItem } from './entities/media-item.entity';
import { MediaScanProgress } from './entities/media-scan-progress.entity';
import { MediaLocationsStore } from './media-locations.store';
import { MediaScanStore } from './media-scan.store';
import { MediaStore } from './media.store';
import { MediaScannerService } from './media-scanner.service';
import { MetadataApiCacheStore } from './metadata-api-cache.store';
import { JikanMetadataService } from './jikan-metadata.service';
import { TmdbMetadataService } from './tmdb-metadata.service';
import { MediaPreviewResolver } from './media-preview.resolver';
import { normalizeForKey } from './title-normalizer';
import {
  detectFromFilenameAndPath,
  type FilenameDetectResult,
} from './filename-metadata';

export interface MediaMetadataPatch {
  title?: string;
  description?: string | null;
  releaseYear?: number | null;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  tags?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

export interface BulkAssignEpisodesInput {
  mediaIds: string[];
  title: string;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  startEpisodeNumber?: number;
  episodeOrder?: 'filename-asc' | 'existing-episode' | 'as-provided';
  tags?: string[];
  releaseYear?: number | null;
}

export interface DeletedMediaItemResult {
  mediaId: string;
  title: string;
  success: boolean;
  deletedEntries: number;
  error?: string;
}

export interface BulkDeleteMediaResult {
  requested: number;
  deleted: number;
  failed: number;
  results: DeletedMediaItemResult[];
}

@Injectable()
export class MediaService {
  private readonly directPlayExtensions = new Set(['.mp4', '.m4v', '.webm']);
  private readonly directPlayVideoCodecHints = [
    'h264',
    'avc',
    'avc1',
    'vp8',
    'vp9',
    'av1',
  ];
  private readonly directPlayAudioCodecHints = ['aac', 'mp3', 'opus', 'vorbis'];
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
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly mediaScanStore: MediaScanStore,
    private readonly scanner: MediaScannerService,
    private readonly configService: ConfigService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mediaAiMetadataService: MediaAiMetadataService,
    private readonly metadataApiCacheStore: MetadataApiCacheStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly mediaPreviewResolver: MediaPreviewResolver,
  ) {}

  async getLocations() {
    const configured = await this.mediaLocationsStore.all();
    const locations =
      configured.length > 0
        ? configured
        : this.normalizeLocations(this.defaultLibraryPaths());

    return {
      locations,
      source: configured.length > 0 ? 'settings' : 'env',
    };
  }

  async setLocations(locations: string[]) {
    const normalized = this.normalizeLocations(locations);
    const saved = await this.mediaLocationsStore.replaceAll(normalized);

    return {
      locations: saved,
      source: 'settings',
    };
  }

  async list(search?: string, tags?: string[]): Promise<MediaItem[]> {
    const all = await this.mediaStore.all();
    const needle = search?.trim().toLowerCase() ?? '';
    const normalizedTags = this.normalizeTagFilters(tags);

    if (!needle && normalizedTags.length === 0) {
      return all;
    }

    return all.filter((item) => {
      const matchesSearch =
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.description?.toLowerCase().includes(needle) ||
        item.relativePath.toLowerCase().includes(needle) ||
        item.tags.some((tag) => tag.toLowerCase().includes(needle));

      if (!matchesSearch) {
        return false;
      }

      if (normalizedTags.length === 0) {
        return true;
      }

      const itemTagSet = this.toNormalizedTagSet(item.tags);
      return normalizedTags.every((tag) => itemTagSet.has(tag));
    });
  }

  async getStats() {
    const indexedItems = await this.mediaStore.count();
    return {
      indexedItems,
    };
  }

  async getById(mediaId: string): Promise<MediaItem> {
    const item = await this.mediaStore.findById(mediaId);
    if (!item) {
      throw new NotFoundException(
        'Media item not found. Scan your library first.',
      );
    }

    return item;
  }

  async detectFilenameMetadata(mediaId: string): Promise<FilenameDetectResult> {
    const item = await this.getById(mediaId);
    const fileName = basename(item.filePath, extname(item.filePath));
    return detectFromFilenameAndPath(fileName, item.relativePath);
  }

  getScanProgress(): MediaScanProgress {
    return this.mediaScanStore.get();
  }

  async clearApiCaches() {
    const persistedEntriesCleared = await this.metadataApiCacheStore.clear();
    const inMemoryEntriesCleared =
      this.tmdbMetadataService.clearLookupCache() +
      this.jikanMetadataService.clearLookupCache();

    return {
      persistedEntriesCleared,
      inMemoryEntriesCleared,
      message: `Cleared ${persistedEntriesCleared} persisted API cache entries and ${inMemoryEntriesCleared} in-memory entries.`,
    };
  }

  async clearMetadataIndex() {
    const removedEntries = await this.mediaStore.clearAll();
    const noun = removedEntries === 1 ? 'entry' : 'entries';

    return {
      removedEntries,
      message: `Cleared ${removedEntries} metadata ${noun}.`,
    };
  }

  async updateMedia(
    mediaId: string,
    patch: MediaMetadataPatch,
  ): Promise<MediaItem> {
    const existing = await this.getById(mediaId);
    const updated = this.applyPatch(existing, patch);

    if (patch.posterUrl) {
      const posterPath = await this.mediaPreviewResolver.downloadPosterThumbnail(
        patch.posterUrl,
        existing.filePath,
        true,
      );
      if (posterPath) {
        updated.previewImagePath = posterPath;
      }
    }

    if (patch.backdropUrl) {
      const backdropPath = await this.mediaPreviewResolver.downloadBackdropThumbnail(
        patch.backdropUrl,
        existing.filePath,
        true,
      );
      if (backdropPath) {
        updated.backdropImagePath = backdropPath;
      }
    }

    await this.mediaStore.upsert(updated);
    return updated;
  }

  async bulkDeleteMediaPermanently(
    mediaIds: string[],
  ): Promise<BulkDeleteMediaResult> {
    const ids = this.normalizeIdList(mediaIds);
    if (ids.length === 0) {
      throw new BadRequestException('At least one mediaId is required.');
    }

    const results: DeletedMediaItemResult[] = [];
    let deleted = 0;

    for (const mediaId of ids) {
      try {
        const result = await this.deleteMediaPermanently(mediaId);
        results.push(result);
        if (result.success) {
          deleted += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown delete error.';
        this.logger.warn(`Permanent delete failed for ${mediaId}: ${message}`);
        results.push({
          mediaId,
          title: mediaId,
          success: false,
          deletedEntries: 0,
          error: message,
        });
      }
    }

    return {
      requested: ids.length,
      deleted,
      failed: ids.length - deleted,
      results,
    };
  }

  async searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }) {
    const candidates = await this.tmdbMetadataService.searchCandidates({
      title: input.title,
      mediaType: input.type,
      releaseYear: input.year,
      limit: input.limit,
    });
    return { candidates };
  }

  async bulkAssignEpisodes(input: BulkAssignEpisodesInput): Promise<{
    updatedCount: number;
    items: MediaItem[];
  }> {
    const ids = this.normalizeIdList(input.mediaIds);
    if (ids.length === 0) {
      throw new BadRequestException('At least one mediaId is required.');
    }

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('Title is required.');
    }

    const found = new Map<string, MediaItem>();
    for (const id of ids) {
      const item = await this.mediaStore.findById(id);
      if (!item) {
        throw new NotFoundException(`Media item not found: ${id}`);
      }
      found.set(id, item);
    }

    const ordered = this.orderForEpisodeAssignment(
      ids.map((id) => found.get(id)!),
      input.episodeOrder ?? 'filename-asc',
    );

    const type = input.type ?? 'show';
    const startEpisode =
      typeof input.startEpisodeNumber === 'number' && input.startEpisodeNumber > 0
        ? Math.floor(input.startEpisodeNumber)
        : 1;
    const seasonNumber =
      typeof input.seasonNumber === 'number' && Number.isFinite(input.seasonNumber)
        ? Math.max(0, Math.floor(input.seasonNumber))
        : type === 'show'
          ? 1
          : null;
    const releaseYear =
      typeof input.releaseYear === 'number' && Number.isFinite(input.releaseYear)
        ? Math.floor(input.releaseYear)
        : undefined;

    const tags = Array.isArray(input.tags) ? input.tags : undefined;

    const updates: MediaItem[] = ordered.map((item, index) => {
      const patch: MediaMetadataPatch = {
        title,
        type,
        seasonNumber,
        episodeNumber: type === 'show' ? startEpisode + index : null,
      };
      if (releaseYear !== undefined) {
        patch.releaseYear = releaseYear;
      }
      if (tags !== undefined) {
        patch.tags = tags;
      }
      return this.applyPatch(item, patch);
    });

    for (const update of updates) {
      await this.mediaStore.upsert(update);
    }

    return {
      updatedCount: updates.length,
      items: updates,
    };
  }

  private applyPatch(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): MediaItem {
    const hasOwn = <K extends keyof MediaMetadataPatch>(key: K) =>
      Object.prototype.hasOwnProperty.call(patch, key);

    const next: MediaItem = { ...existing };

    if (hasOwn('title')) {
      const cleaned = (patch.title ?? '').trim();
      if (!cleaned) {
        throw new BadRequestException('Title cannot be empty.');
      }
      next.title = cleaned;
    }

    if (hasOwn('description')) {
      const value = patch.description;
      if (value === null || value === undefined) {
        next.description = null;
      } else {
        const cleaned = value.trim();
        next.description = cleaned ? cleaned : null;
      }
    }

    if (hasOwn('releaseYear')) {
      next.releaseYear = this.coerceOptionalInt(patch.releaseYear);
    }

    if (hasOwn('type')) {
      const value = patch.type;
      if (value !== 'movie' && value !== 'show' && value !== 'other') {
        throw new BadRequestException('Invalid media type.');
      }
      next.type = value;
    }

    if (hasOwn('seasonNumber')) {
      next.seasonNumber = this.coerceOptionalInt(patch.seasonNumber);
    }

    if (hasOwn('episodeNumber')) {
      next.episodeNumber = this.coerceOptionalInt(patch.episodeNumber);
    }

    if (hasOwn('episodeTitle')) {
      const value = patch.episodeTitle;
      if (value === null || value === undefined) {
        next.episodeTitle = null;
      } else {
        const cleaned = value.trim();
        next.episodeTitle = cleaned ? cleaned : null;
      }
    }

    if (hasOwn('tags')) {
      next.tags = this.normalizeEditableTags(patch.tags ?? []);
    }

    // Shows always need a season; default to 1 if becoming a show and unset
    if (next.type === 'show' && next.seasonNumber === null) {
      next.seasonNumber = 1;
    }

    // Movies/other don't carry season/episode info
    if (next.type !== 'show') {
      next.seasonNumber = null;
      next.episodeNumber = null;
      next.episodeTitle = null;
    }

    next.normalizedTitle = normalizeForKey(next.title);
    next.dedupeKey = this.buildDedupeKey(next);

    const now = new Date().toISOString();
    next.updatedAt = now;
    next.metadataRefreshedAt = now;

    return next;
  }

  private buildDedupeKey(item: MediaItem): string {
    const normalizedTitle = item.normalizedTitle || normalizeForKey(item.title);
    if (item.type === 'show') {
      return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
    }
    if (item.type === 'movie') {
      return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
    }
    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  private coerceOptionalInt(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.floor(value);
  }

  private normalizeEditableTags(tags: readonly string[]): string[] {
    const deduped = new Map<string, string>();
    for (const tag of tags) {
      if (typeof tag !== 'string') continue;
      const cleaned = tag.trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, cleaned);
      }
    }
    return [...deduped.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private normalizeIdList(ids: readonly string[] | undefined): string[] {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      const cleaned = id.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push(cleaned);
    }
    return out;
  }

  private orderForEpisodeAssignment(
    items: MediaItem[],
    mode: 'filename-asc' | 'existing-episode' | 'as-provided',
  ): MediaItem[] {
    if (mode === 'as-provided') {
      return [...items];
    }

    if (mode === 'existing-episode') {
      return [...items].sort((left, right) => {
        const leftSeason = left.seasonNumber ?? Number.MAX_SAFE_INTEGER;
        const rightSeason = right.seasonNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftSeason !== rightSeason) return leftSeason - rightSeason;

        const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
        const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftEpisode !== rightEpisode) return leftEpisode - rightEpisode;

        return left.relativePath.localeCompare(right.relativePath, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
    }

    return [...items].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }

  async scan(libraryPath?: string, libraryPaths?: string[]) {
    const existing = this.mediaScanStore.get();
    if (existing.status === 'running') {
      return existing;
    }

    const sourcePaths = await this.resolveScanLocations(
      libraryPath,
      libraryPaths,
    );

    if (sourcePaths.length === 0) {
      throw new NotFoundException(
        'No media locations configured. Add locations in settings or set MEDIA_LIBRARY_PATH.',
      );
    }

    const scanId = randomUUID();
    const started = this.mediaScanStore.start(scanId, sourcePaths);
    void this.runScan(scanId, sourcePaths);

    return started;
  }

  async getPlaybackPlan(mediaId: string) {
    const item = await this.getById(mediaId);

    return {
      mediaId: item.id,
      title: item.title,
      directPlay: {
        supported: this.supportsDirectPlay(item),
        url: `/api/stream/${item.id}/direct`,
      },
      hls: {
        startUrl: `/api/stream/${item.id}/hls/start`,
      },
      subtitles: {
        listUrl: `/api/subtitles/${item.id}`,
      },
    };
  }

  private supportsDirectPlay(item: MediaItem): boolean {
    const extension = item.extension.toLowerCase();
    if (!this.directPlayExtensions.has(extension)) {
      return false;
    }

    const videoCodec = (item.videoCodec ?? '').toLowerCase();
    if (!videoCodec) {
      return false;
    }

    const videoSupported = this.directPlayVideoCodecHints.some((hint) =>
      videoCodec.includes(hint),
    );
    if (!videoSupported) {
      return false;
    }

    const audioCodec = (item.audioCodec ?? '').toLowerCase();
    if (!audioCodec) {
      return true;
    }

    return this.directPlayAudioCodecHints.some((hint) =>
      audioCodec.includes(hint),
    );
  }

  async streamPreviewImage(mediaId: string, response: Response): Promise<void> {
    const item = await this.getById(mediaId);
    const previewImagePath = item.previewImagePath?.trim() || '';

    if (!previewImagePath) {
      throw new NotFoundException(
        'Preview image not available for this media item.',
      );
    }

    if (this.isRemoteUrl(previewImagePath)) {
      response.redirect(previewImagePath);
      return;
    }

    await this.streamImageFromPath(previewImagePath, response);
  }

  async streamBackdropImage(mediaId: string, response: Response): Promise<void> {
    const item = await this.getById(mediaId);
    const backdropImagePath = item.backdropImagePath?.trim() || '';

    if (!backdropImagePath) {
      throw new NotFoundException(
        'Backdrop image not available for this media item.',
      );
    }

    if (this.isRemoteUrl(backdropImagePath)) {
      response.redirect(backdropImagePath);
      return;
    }

    await this.streamImageFromPath(backdropImagePath, response);
  }

  async streamChapterThumbnail(
    mediaId: string,
    index: number,
    response: Response,
  ): Promise<void> {
    const item = await this.getById(mediaId);
    const thumbnail = item.chapterThumbnails[index];

    if (!thumbnail?.imagePath) {
      throw new NotFoundException('Chapter thumbnail not available.');
    }

    await this.streamImageFromPath(thumbnail.imagePath, response);
  }

  private async resolveScanLocations(
    libraryPath?: string,
    libraryPaths?: string[],
  ): Promise<string[]> {
    if (Array.isArray(libraryPaths) && libraryPaths.length > 0) {
      return this.normalizeLocations(libraryPaths);
    }

    if (libraryPath?.trim()) {
      return this.normalizeLocations([libraryPath]);
    }

    const configured = await this.mediaLocationsStore.all();
    if (configured.length > 0) {
      return this.normalizeLocations(configured);
    }

    return this.normalizeLocations(this.defaultLibraryPaths());
  }

  private defaultLibraryPaths(): string[] {
    const pathFromPlural =
      this.configService.get<string>('MEDIA_LIBRARY_PATHS') ?? '';
    const pathFromSingle =
      this.configService.get<string>('MEDIA_LIBRARY_PATH') ?? '';
    const combined = [pathFromPlural, pathFromSingle].filter(Boolean).join(';');

    if (!combined) {
      return [];
    }

    return combined
      .split(/[;,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private normalizeLocations(paths: string[]): string[] {
    const unique = new Set<string>();
    for (const rawPath of paths) {
      const trimmed = rawPath.trim();
      if (!trimmed) {
        continue;
      }

      unique.add(trimmed);
    }

    return [...unique];
  }

  private normalizeTagFilters(tags?: string[]): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const normalized = new Set<string>();
    for (const rawTag of tags) {
      if (typeof rawTag !== 'string') {
        continue;
      }

      const splitValues = rawTag.split(',');
      for (const splitValue of splitValues) {
        const cleaned = splitValue.trim().toLowerCase();
        if (cleaned) {
          normalized.add(cleaned);
        }
      }
    }

    return [...normalized];
  }

  private toNormalizedTagSet(tags: readonly string[] | null | undefined): Set<string> {
    const normalized = new Set<string>();

    if (!Array.isArray(tags) || tags.length === 0) {
      return normalized;
    }

    for (const tag of tags) {
      if (typeof tag !== 'string') {
        continue;
      }

      const cleaned = tag.trim().toLowerCase();
      if (cleaned) {
        normalized.add(cleaned);
      }
    }

    return normalized;
  }

  private async streamImageFromPath(
    imagePath: string,
    response: Response,
  ): Promise<void> {
    const resolvedPath = resolve(imagePath);

    let imageStats;
    try {
      imageStats = await stat(resolvedPath);
    } catch {
      throw new NotFoundException('Image file not found.');
    }

    if (!imageStats.isFile()) {
      throw new NotFoundException('Image file not found.');
    }

    const contentType = lookup(resolvedPath) || 'application/octet-stream';
    response.setHeader('Content-Type', contentType.toString());
    response.setHeader('Content-Length', imageStats.size);
    response.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(resolvedPath).pipe(response);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private async deleteMediaPermanently(
    mediaId: string,
  ): Promise<DeletedMediaItemResult> {
    const item = await this.getById(mediaId);

    if (!isAbsolute(item.filePath)) {
      throw new BadRequestException(
        `Media file path is invalid for ${item.title}.`,
      );
    }

    const deletionTargets = await this.collectDeletionTargets(item);
    let deletedEntries = 0;

    for (const targetPath of deletionTargets) {
      if (await this.removeFileIfExists(targetPath)) {
        deletedEntries += 1;
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

  private async removeDirectoryIfExists(directoryPath: string): Promise<boolean> {
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

  private async runScan(scanId: string, sourcePaths: string[]): Promise<void> {
    type SourceFile = {
      sourcePath: string;
      locationLabel: string;
      filePath: string;
      displayPath: string;
    };

    try {
      this.mediaScanStore.update(scanId, {
        phase: 'collecting',
        message: 'Collecting media files...',
      });

      const sourceFiles: SourceFile[] = [];

      for (const sourcePath of sourcePaths) {
        const locationLabel = basename(resolve(sourcePath)) || sourcePath;
        this.mediaScanStore.update(scanId, {
          phase: 'collecting',
          currentFile: sourcePath,
          message: `Collecting files from ${locationLabel}...`,
        });

        const files = await this.scanner.collectVideoFiles(sourcePath);
        const normalizedRoot = resolve(sourcePath);

        for (const filePath of files) {
          const relativePath = relative(normalizedRoot, filePath)
            .split(sep)
            .join('/');

          sourceFiles.push({
            sourcePath,
            locationLabel,
            filePath,
            displayPath: `${locationLabel}/${relativePath}`,
          });
        }

        this.mediaScanStore.update(scanId, {
          totalFiles: sourceFiles.length,
        });
      }

      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: null,
        processedFiles: 0,
        failedFiles: 0,
        indexedItems: 0,
        totalFiles: sourceFiles.length,
        message:
          sourceFiles.length === 0
            ? 'No media files found. Saving empty index...'
            : 'Analyzing media files...',
      });

      const items: MediaItem[] = [];
      let failedFiles = 0;

      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: null,
        message: 'Normalizing media names...',
      });

      const normalizedTitleByPath =
        await this.mediaAiMetadataService.normalizeTitlesForPaths(
          sourceFiles.map((sourceFile) => sourceFile.filePath),
          ({ done, total }) => {
            if (total <= 0) {
              return;
            }
            this.mediaScanStore.update(scanId, {
              message: `Normalizing media names (${Math.min(done, total)} of ${total} unique titles)...`,
            });
          },
        );

      for (let index = 0; index < sourceFiles.length; index += 1) {
        const sourceFile = sourceFiles[index];
        this.mediaScanStore.update(scanId, {
          phase: 'probing',
          currentFile: sourceFile.displayPath,
          processedFiles: index,
          message: `Analyzing file ${index + 1} of ${sourceFiles.length}...`,
        });

        try {
          const item = await this.scanner.probeFile(
            sourceFile.filePath,
            sourceFile.sourcePath,
            normalizedTitleByPath.get(sourceFile.filePath),
          );

          const indexedItem = {
            ...item,
            relativePath: `${sourceFile.locationLabel}/${item.relativePath}`,
          };

          await this.mediaStore.upsert(indexedItem);
          items.push(indexedItem);
        } catch (error) {
          failedFiles += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Skipping ${sourceFile.displayPath}: ${message}`);
        }

        this.mediaScanStore.update(scanId, {
          processedFiles: index + 1,
          indexedItems: items.length,
          failedFiles,
        });
      }

      const { items: deduplicatedItems, duplicatesRemoved } =
        await this.applyDeduplication(items);

      deduplicatedItems.sort((left, right) =>
        left.title.localeCompare(right.title),
      );

      this.mediaScanStore.update(scanId, {
        phase: 'saving',
        currentFile: null,
        message: 'Saving media index...',
      });

      await this.mediaStore.replaceAll(deduplicatedItems);

      this.mediaScanStore.complete(scanId, {
        totalFiles: sourceFiles.length,
        processedFiles: sourceFiles.length,
        indexedItems: deduplicatedItems.length,
        failedFiles,
        message:
          duplicatesRemoved > 0
            ? `Scan complete: ${deduplicatedItems.length} media items indexed across ${sourcePaths.length} locations (${duplicatesRemoved} duplicates removed).`
            : `Scan complete: ${deduplicatedItems.length} media items indexed across ${sourcePaths.length} locations.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Media scan failed unexpectedly.';

      this.logger.error(`Media scan failed: ${message}`);
      this.mediaScanStore.fail(scanId, message);
    }
  }

  private async applyDeduplication(items: MediaItem[]): Promise<{
    items: MediaItem[];
    duplicatesRemoved: number;
  }> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.aiDeduplicationEnabled) {
      return {
        items,
        duplicatesRemoved: 0,
      };
    }

    const deduplicated = new Map<string, MediaItem>();
    let duplicatesRemoved = 0;

    for (const item of items) {
      const key = item.dedupeKey || this.fallbackDedupeKey(item);
      const existing = deduplicated.get(key);

      if (!existing) {
        deduplicated.set(key, item);
        continue;
      }

      duplicatesRemoved += 1;
      deduplicated.set(key, this.choosePreferredDuplicate(existing, item));
    }

    return {
      items: [...deduplicated.values()],
      duplicatesRemoved,
    };
  }

  private fallbackDedupeKey(item: MediaItem): string {
    const normalizedTitle =
      item.normalizedTitle || normalizeForKey(item.title);

    if (item.type === 'show') {
      return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
    }

    if (item.type === 'movie') {
      return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  private choosePreferredDuplicate(
    primary: MediaItem,
    candidate: MediaItem,
  ): MediaItem {
    const primaryScore = this.qualityScore(primary);
    const candidateScore = this.qualityScore(candidate);

    if (candidateScore > primaryScore) {
      return candidate;
    }

    if (candidateScore < primaryScore) {
      return primary;
    }

    if (candidate.updatedAt > primary.updatedAt) {
      return candidate;
    }

    return primary;
  }

  private qualityScore(item: MediaItem): number {
    const resolution = (item.width ?? 0) * (item.height ?? 0);
    const sizeScore = Math.round(item.sizeBytes / 1_000_000);
    const subtitleScore = item.subtitleStreams * 3;

    return resolution + sizeScore + subtitleScore;
  }
}
