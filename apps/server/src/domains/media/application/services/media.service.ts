import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  readdir,
  rm,
  unlink,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
} from 'node:path';
import {
  MediaItem,
  SeriesAssignmentRules,
} from '../../domain/entities/media-item.entity';
import { MediaScanProgress } from '../../domain/entities/media-scan-progress.entity';
import { MediaScanStore } from '../../infrastructure/stores/media-scan.store';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';
import {
  JikanMetadataService,
} from './remote-metadata/jikan-metadata.service';
import {
  TmdbMetadataService,
} from './remote-metadata/tmdb-metadata.service';
import { MediaPreviewResolver } from '../../infrastructure/resolvers/media-preview.resolver';
import {
  cleanTitle,
  normalizeForKey,
} from '../../infrastructure/helpers/title-normalizer';
import {
  detectFromFilenameAndPath,
  type FilenameDetectResult,
} from '../../infrastructure/helpers/filename-metadata';
import {
  type TorrentFileHint,
} from '../../../torrent/application/services/torrent.service';
import {
  readMediaFileHeader,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../core/infrastructure/shared/media-header-probe';
import { MediaFsFileOpsService } from './filesystem/media-fs-file-ops.service';
import { MediaTorrentIndexingService } from './torrent-intake/media-torrent-indexing.service';
import { MediaLibraryLocationsService } from './library-locations/media-library-locations.service';
import { MediaStorageSummaryService } from './storage/media-storage-summary.service';
import { MediaIndexedItemRefreshService } from './index-refresh/media-indexed-item-refresh.service';
import { MediaRemoteCatalogService } from './remote-catalog/media-remote-catalog.service';
import type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
import { MediaMetadataPatchApplicationService } from './metadata-update';
import { MediaMetadataPatchEnrichmentService } from './metadata-update/media-metadata-patch-enrichment.service';
import { MediaMetadataArtworkRefreshService } from './metadata-update/media-metadata-artwork-refresh.service';
import { MediaMetadataIoService } from './metadata-io/media-metadata-io.service';
import { MediaMetadataImportNormalizerService } from './metadata-io/media-metadata-import-normalizer.service';
import { MediaFileResolutionService } from './path-resolution/media-file-resolution.service';
import { MediaImageStreamService } from './image-stream/media-image-stream.service';
import { MediaScanExecutionService } from './scan-execution/media-scan-execution.service';
import { MediaRecycleDeletionsService } from './recycle-deletions/media-recycle-deletions.service';
import { MediaPermanentDeleteService } from './recycle-deletions/media-permanent-delete.service';
import {
  MediaEpisodeCatalogService,
} from './episode-catalog/media-episode-catalog.service';
import { MediaPlaybackService } from './playback/media-playback.service';

export type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';

export interface BulkAssignEpisodesInput {
  mediaIds: string[];
  title: string;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  startEpisodeNumber?: number;
  episodeOrder?: 'filename-asc' | 'existing-episode' | 'as-provided';
  tags?: string[];
  releaseYear?: number | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
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

export interface MediaTorrentDownloadProgressItem {
  mediaId: string;
  hash: string;
  progressPercent: number;
  state: string;
}

export interface MediaStorageSummary {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  driveCount: number;
  unavailableDriveCount: number;
  asOf: string;
}

interface MediaDriveStorageSnapshot {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
}

export interface PlaybackAudioTrack {
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

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

export interface SeriesEpisodeTrackerMissingEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export type SeriesEpisodeTrackerResult =
  | {
      status: 'unavailable';
      reason: string;
      source: null;
    }
  | {
      status: 'ready';
      source: 'jikan' | 'tmdb';
      sourceLabel: string;
      providerId: string;
      isComplete: boolean;
      completionPercent: number;
      expectedEpisodeCount: number;
      collectedEpisodeCount: number;
      missingEpisodeCount: number;
      primarySeasonNumber: number;
      seasonsSeen: number[];
      extraSeasons: number[];
      missingSeasons: number[];
      missingEpisodes: SeriesEpisodeTrackerMissingEpisode[];
      updatedAt: string;
      note: string | null;
    };

export type MetadataImportMode = 'replace' | 'upsert';

interface MetadataExportImageAsset {
  mimeType: string;
  base64: string;
}

export interface MediaMetadataExportPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  itemCount: number;
  items: MediaItem[];
  imageAssets?: Record<string, MetadataExportImageAsset>;
}

export interface MediaMetadataImportResult {
  mode: MetadataImportMode;
  receivedItems: number;
  importedItems: number;
  message: string;
}

type RemoteMediaProvider = 'tmdb' | 'jikan';

interface ParsedRemoteMediaId {
  provider: RemoteMediaProvider;
  mediaType: 'movie' | 'show';
  providerId: string;
}

interface MetadataImportPathContext {
  roots: string[];
  rootByLabel: Map<string, string>;
}

@Injectable()
export class MediaService {
  private readonly imageAssetPrefix = 'asset://';
  private readonly posterThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'posters',
  );
  private readonly backdropThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'backdrops',
  );
  private readonly logger = new Logger(MediaService.name);
  private readonly lastHeadGateLogAtMsByHash = new Map<string, number>();
  private readonly lastFallbackWalkAtMsByHash = new Map<string, number>();

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaLibraryLocationsService: MediaLibraryLocationsService,
    private readonly mediaStorageSummaryService: MediaStorageSummaryService,
    private readonly mediaIndexedItemRefreshService: MediaIndexedItemRefreshService,
    private readonly mediaRemoteCatalogService: MediaRemoteCatalogService,
    private readonly mediaEpisodeCatalogService: MediaEpisodeCatalogService,
    private readonly mediaMetadataPatchApplicationService: MediaMetadataPatchApplicationService,
    private readonly mediaMetadataPatchEnrichmentService: MediaMetadataPatchEnrichmentService,
    private readonly mediaMetadataArtworkRefreshService: MediaMetadataArtworkRefreshService,
    private readonly mediaMetadataIoService: MediaMetadataIoService,
    private readonly mediaMetadataImportNormalizerService: MediaMetadataImportNormalizerService,
    private readonly mediaFileResolutionService: MediaFileResolutionService,
    private readonly mediaImageStreamService: MediaImageStreamService,
    private readonly mediaScanExecutionService: MediaScanExecutionService,
    private readonly mediaPlaybackService: MediaPlaybackService,
    private readonly mediaRecycleDeletionsService: MediaRecycleDeletionsService,
    private readonly mediaPermanentDeleteService: MediaPermanentDeleteService,
    private readonly mediaScanStore: MediaScanStore,
    private readonly metadataApiCacheStore: MetadataApiCacheStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly mediaPreviewResolver: MediaPreviewResolver,
    private readonly mediaFsFileOpsService: MediaFsFileOpsService,
    private readonly mediaTorrentIndexingService: MediaTorrentIndexingService,
  ) {}

  async getLocations(): Promise<{
    locations: string[];
    source: 'settings' | 'env';
  }> {
    return this.mediaLibraryLocationsService.getLocations();
  }

  async getStorageSummary(): Promise<MediaStorageSummary> {
    const scanLocations = await this.mediaFileResolutionService.resolveScanLocations();
    return this.mediaStorageSummaryService.summarizeStorage(scanLocations);
  }

  async setLocations(locations: string[]): Promise<{
    locations: string[];
    source: 'settings';
  }> {
    return this.mediaLibraryLocationsService.setLocations(locations);
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

  async refreshIndexedMediaItemForAutomaticIntake(
    existing: MediaItem,
  ): Promise<void> {
    await this.mediaIndexedItemRefreshService.refreshIndexedMediaItem(existing);
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

  async getSeriesEpisodeTracker(
    mediaId: string,
  ): Promise<SeriesEpisodeTrackerResult> {
    const current = await this.getById(mediaId);

    return this.mediaEpisodeCatalogService.getSeriesEpisodeTracker(current);
  }

  async resolveMediaFilePath(
    filePath: string,
    relativePath: string,
    providedContext?: MetadataImportPathContext,
  ): Promise<string> {
    return this.mediaFileResolutionService.resolveMediaFilePath(
      filePath,
      relativePath,
      providedContext,
    );
  }

  async indexTorrentFile(
    hash: string,
  ): Promise<
    | { status: 'indexed'; media: MediaItem }
    | { status: 'pending'; reason: string }
  > {
    return this.mediaTorrentIndexingService.indexTorrentFile(hash);
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

  async listRecycleDeletions(
    limit?: number,
  ): Promise<RecycleDeletionsListResult> {
    return this.mediaRecycleDeletionsService.listRecycleDeletions(limit);
  }

  async purgeRecycleDeletions(input: {
    operationPaths?: string[];
    purgeAll?: boolean;
    olderThanDays?: number;
  }): Promise<PurgeRecycleDeletionsResult> {
    return this.mediaRecycleDeletionsService.purgeRecycleDeletions(input);
  }

  async exportMetadata(): Promise<MediaMetadataExportPayload> {
    const items = await this.mediaStore.all();
    const pathContext = await this.mediaMetadataIoService.createImportPathContext();
    const imageAssets: Record<string, MetadataExportImageAsset> = {};
    const portableItems = await Promise.all(
      items.map((item) =>
        this.mediaMetadataIoService.toPortableExportItem(
          item,
          pathContext,
          imageAssets,
        ),
      ),
    );

    const assetCount = Object.keys(imageAssets).length;

    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      itemCount: portableItems.length,
      items: portableItems,
      imageAssets: assetCount > 0 ? imageAssets : undefined,
    };
  }

  async importMetadata(input: {
    mode?: MetadataImportMode;
    items: unknown[];
    imageAssets?: Record<string, MetadataExportImageAsset> | null;
  }): Promise<MediaMetadataImportResult> {
    const mode: MetadataImportMode =
      input.mode === 'replace' ? 'replace' : 'upsert';
    const sourceItems = Array.isArray(input.items) ? input.items : [];

    if (sourceItems.length === 0 && mode !== 'replace') {
      throw new BadRequestException(
        'Import payload must include at least one metadata item.',
      );
    }

    const importedAt = new Date().toISOString();
    const pathContext = await this.mediaMetadataIoService.createImportPathContext();

    if (sourceItems.length > 0 && pathContext.roots.length === 0) {
      throw new BadRequestException(
        'Import requires at least one saved media location. Configure media locations first, then retry the import.',
      );
    }

    const restoredAssetPathById = new Map<string, string>();
    const unresolvedPaths: string[] = [];
    const normalizedItems = sourceItems.map((entry, index) =>
      this.mediaMetadataImportNormalizerService.normalizeImportedMediaItem(
        entry,
        index,
        importedAt,
        pathContext,
      ),
    );
    const items: MediaItem[] = [];

    for (const item of normalizedItems) {
      let nextItem = item;

      try {
        const resolved =
          await this.mediaMetadataIoService.resolveImportedFilePathWithinLocations(
            item.filePath,
            item.relativePath,
            pathContext,
          );

        nextItem = {
          ...nextItem,
          filePath: resolved.absoluteFilePath,
          relativePath: `${resolved.locationLabel}/${resolved.relativePathUnderLocation}`,
          extension:
            (
              extname(resolved.absoluteFilePath) ||
              nextItem.extension ||
              ''
            ).toLowerCase() || nextItem.extension,
        };
      } catch {
        unresolvedPaths.push(item.relativePath || item.filePath);
        continue;
      }

      const hydratedItem = await this.mediaMetadataIoService.restorePortableImagePaths(
        nextItem,
        input.imageAssets ?? null,
        restoredAssetPathById,
      );
      items.push(hydratedItem);
    }

    if (unresolvedPaths.length > 0) {
      const examples = unresolvedPaths.slice(0, 5).join(', ');
      throw new BadRequestException(
        `Unable to resolve ${unresolvedPaths.length} imported media path(s) inside configured media locations. Examples: ${examples}`,
      );
    }

    if (mode === 'replace') {
      await this.mediaStore.replaceAll(items);
    } else {
      for (const item of items) {
        await this.mediaStore.upsert(item);
      }
    }

    const noun = items.length === 1 ? 'item' : 'items';

    return {
      mode,
      receivedItems: sourceItems.length,
      importedItems: items.length,
      message:
        mode === 'replace'
          ? `Imported ${items.length} metadata ${noun} and replaced existing index.`
          : `Imported ${items.length} metadata ${noun}. Existing entries were upserted by file path.`,
    };
  }

  async importMetadataFromJson(input: {
    mode?: MetadataImportMode;
    rawJson: string;
  }): Promise<MediaMetadataImportResult> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(input.rawJson);
    } catch {
      throw new BadRequestException(
        'Import file is not valid JSON. Export a fresh metadata backup and try again.',
      );
    }

    return this.importMetadata({
      mode: input.mode,
      items: this.mediaMetadataIoService.extractImportedItems(parsed),
      imageAssets: this.mediaMetadataIoService.extractImportedImageAssets(parsed),
    });
  }

  async updateMedia(
    mediaId: string,
    patch: MediaMetadataPatch,
  ): Promise<MediaItem> {
    const existing = await this.getById(mediaId);
    const { effectivePatch, remoteSelectionChanged, remoteCandidate } =
      await this.mediaMetadataPatchEnrichmentService.enrichPatchForMetadataUpdate(
        existing,
        patch,
      );
    const updated = this.mediaMetadataPatchApplicationService.applyPatch(
      existing,
      effectivePatch,
    );
    this.mediaEpisodeCatalogService.reconcileEpisodeCatalogLink(
      updated,
      existing,
      remoteCandidate,
      true,
    );

    const posterPatchProvided = this.hasPatchKey(patch, 'posterUrl');
    const backdropPatchProvided = this.hasPatchKey(patch, 'backdropUrl');
    const shouldRebuildArtwork =
      remoteSelectionChanged || posterPatchProvided || backdropPatchProvided;

    if (shouldRebuildArtwork) {
      const preferredPosterUrl = this.normalizeOptionalString(
        this.hasPatchKey(effectivePatch, 'posterUrl')
          ? effectivePatch.posterUrl
          : (remoteCandidate?.posterUrl ?? null),
      );
      const preferredBackdropUrl = this.normalizeOptionalString(
        this.hasPatchKey(effectivePatch, 'backdropUrl')
          ? effectivePatch.backdropUrl
          : (remoteCandidate?.backdropUrl ?? null),
      );

      let resolvedArtworkFilePath = updated.filePath;
      try {
        resolvedArtworkFilePath = await this.resolveMediaFilePath(
          updated.filePath,
          updated.relativePath,
        );
      } catch {
        // Fall back to the stored path if the importer path resolver cannot map it.
      }

      const rebuiltArtwork =
        await this.mediaMetadataArtworkRefreshService.rebuildArtworkForMetadataUpdate(
          {
            item: updated,
            resolvedFilePath: resolvedArtworkFilePath,
            preferredPosterUrl,
            preferredBackdropUrl,
            forceDownload: true,
            allowExistingFallback: !remoteSelectionChanged,
          },
        );

      updated.previewImagePath = rebuiltArtwork.previewImagePath;
      updated.backdropImagePath = rebuiltArtwork.backdropImagePath;
      updated.chapterThumbnails = rebuiltArtwork.chapterThumbnails;
    }

    await this.mediaStore.upsert(updated);
    return updated;
  }

  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }

  private hasPatchKey<K extends keyof MediaMetadataPatch>(
    patch: MediaMetadataPatch,
    key: K,
  ): boolean {
    return Object.prototype.hasOwnProperty.call(patch, key);
  }

  async bulkDeleteMediaPermanently(
    mediaIds: string[],
  ): Promise<BulkDeleteMediaResult> {
    const ids = this.mediaEpisodeCatalogService.normalizeIdList(mediaIds);
    if (ids.length === 0) {
      throw new BadRequestException('At least one mediaId is required.');
    }

    const results: DeletedMediaItemResult[] = [];
    let deleted = 0;

    for (const mediaId of ids) {
      try {
        const result =
          await this.mediaPermanentDeleteService.deleteMediaPermanently(mediaId);
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
    return this.mediaRemoteCatalogService.searchMetadataCandidates(input);
  }

  async searchRemoteMediaCatalog(input: {
    query: string;
    limit?: number;
    page?: number;
    providers?: RemoteMediaProvider[];
    tags?: string[];
    useCache?: boolean;
  }): Promise<{
    query: string;
    providers: RemoteMediaProvider[];
    total: number;
    page: number;
    hasMore: boolean;
    items: MediaItem[];
  }> {
    return this.mediaRemoteCatalogService.searchRemoteMediaCatalog(input);
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    return this.mediaRemoteCatalogService.getRemoteMediaById(remoteId);
  }

  async bulkAssignEpisodes(input: BulkAssignEpisodesInput): Promise<{
    updatedCount: number;
    items: MediaItem[];
  }> {
    const ids = this.mediaEpisodeCatalogService.normalizeIdList(input.mediaIds);
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

    const ordered = this.mediaEpisodeCatalogService.orderForEpisodeAssignment(
      ids.map((id) => found.get(id)!),
      input.episodeOrder ?? 'filename-asc',
    );

    const type = input.type ?? 'show';
    const startEpisode =
      typeof input.startEpisodeNumber === 'number' &&
      input.startEpisodeNumber > 0
        ? Math.floor(input.startEpisodeNumber)
        : 1;
    const seasonNumber =
      typeof input.seasonNumber === 'number' &&
      Number.isFinite(input.seasonNumber)
        ? Math.max(-1, Math.floor(input.seasonNumber))
        : type === 'show'
          ? 1
          : null;
    const releaseYear =
      typeof input.releaseYear === 'number' &&
      Number.isFinite(input.releaseYear)
        ? Math.floor(input.releaseYear)
        : undefined;

    const tags = Array.isArray(input.tags) ? input.tags : undefined;
    const hasSeriesAssignmentRules = Object.prototype.hasOwnProperty.call(
      input,
      'seriesAssignmentRules',
    );
    const seriesAssignmentRules =
      this.mediaMetadataPatchApplicationService.normalizeSeriesAssignmentRules(
        input.seriesAssignmentRules,
      );

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
      if (hasSeriesAssignmentRules) {
        patch.seriesAssignmentRules = seriesAssignmentRules;
      }
      return this.mediaMetadataPatchApplicationService.applyPatch(item, patch);
    });

    for (const update of updates) {
      await this.mediaStore.upsert(update);
    }

    return {
      updatedCount: updates.length,
      items: updates,
    };
  }

  async scan(libraryPath?: string, libraryPaths?: string[]) {
    const existing = this.mediaScanStore.get();
    if (existing.status === 'running') {
      return existing;
    }

    const sourcePaths = await this.mediaFileResolutionService.resolveScanLocations(
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
    void this.mediaScanExecutionService.runScan(scanId, sourcePaths);

    return started;
  }

  async getPlaybackAudioTracks(mediaId: string): Promise<PlaybackAudioTrack[]> {
    const item = await this.getById(mediaId);
    return this.mediaPlaybackService.getPlaybackAudioTracks(item);
  }

  async getPlaybackPlan(mediaId: string) {
    const item = await this.getById(mediaId);
    return this.mediaPlaybackService.getPlaybackPlan(item);
  }

  async getTorrentDownloadProgressByMediaIds(
    mediaIds: string[],
  ): Promise<{ items: MediaTorrentDownloadProgressItem[] }> {
    return this.mediaPlaybackService.getTorrentDownloadProgressByMediaIds(
      mediaIds,
    );
  }

  async streamPreviewImage(mediaId: string, response: Response): Promise<void> {
    const item = await this.getById(mediaId);
    await this.mediaImageStreamService.streamPreviewImage(item, response);
  }

  async streamBackdropImage(
    mediaId: string,
    response: Response,
  ): Promise<void> {
    const item = await this.getById(mediaId);
    await this.mediaImageStreamService.streamBackdropImage(item, response);
  }

  async streamChapterThumbnail(
    mediaId: string,
    index: number,
    response: Response,
  ): Promise<void> {
    const item = await this.getById(mediaId);
    await this.mediaImageStreamService.streamChapterThumbnail(
      item,
      index,
      response,
    );
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

  private toNormalizedTagSet(
    tags: readonly string[] | null | undefined,
  ): Set<string> {
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
}



