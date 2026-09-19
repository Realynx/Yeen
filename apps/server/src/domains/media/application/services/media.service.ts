import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { basename, extname, join } from 'node:path';
import { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaScanProgress } from '../../domain/entities/media-scan-progress.entity';
import { MediaScanStore } from '../../infrastructure/stores/media-scan.store';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';
import { JikanMetadataService } from './remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from './remote-metadata/tmdb-metadata.service';
import {
  detectFromFilenameAndPath,
  type FilenameDetectResult,
} from '../../infrastructure/helpers/filename-metadata';
import { MediaLibraryLocationsService } from './media-library-locations.service';
import { MediaStorageSummaryService } from './media-storage-summary.service';
import { MediaIndexedItemRefreshService } from './index-refresh/media-indexed-item-refresh.service';
import { MediaRemoteCatalogService } from './remote-catalog/media-remote-catalog.service';
import type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
import { MediaMetadataPatchApplicationService } from './metadata-update';
import { MediaMetadataPatchEnrichmentService } from './metadata-update/media-metadata-patch-enrichment.service';
import { MediaMetadataArtworkRefreshService } from './metadata-update/media-metadata-artwork-refresh.service';
import { MediaMetadataIoService } from './metadata-io/media-metadata-io.service';
import { MediaMetadataImportNormalizerService } from './metadata-io/media-metadata-import-normalizer.service';
import { MediaFileResolutionService } from './path-resolution/media-file-resolution.service';
import { MediaImageStreamService } from './media-image-stream.service';
import { MediaScanExecutionService } from './media-scan-execution.service';
import { MediaRecycleDeletionsService } from './recycle-deletions/media-recycle-deletions.service';
import { MediaPermanentDeleteService } from './recycle-deletions/media-permanent-delete.service';
import { MediaEpisodeCatalogService } from './episode-catalog/media-episode-catalog.service';
import { MediaPlaybackService } from './media-playback.service';
import { MediaScannerService } from './scanner/media-scanner.service';
import {
  exportMetadataValue,
  importMetadataFromJsonValue,
  importMetadataValue,
  updateMediaValue,
  type MediaMetadataOpsContext,
} from './media-service-metadata.helper';
import { bulkAssignEpisodesValue } from './media-service-bulk-assign.helper';
import {
  bulkDeleteMediaPermanentlyValue,
  getRemoteMediaByIdValue,
  searchMetadataCandidatesValue,
  searchRemoteMediaCatalogValue,
  type MediaCatalogOpsContext,
} from './media-service-catalog.helper';
import {
  getPlaybackAudioTracksValue,
  getPlaybackPlanValue,
  scanValue,
  streamBackdropImageValue,
  streamChapterThumbnailValue,
  streamPreviewImageValue,
  type MediaPlaybackOpsContext,
} from './media-service-playback.helper';
import {
  listValue,
  type MediaListOpsContext,
} from './media-service-list.helper';
import { reconcileDurationSecondsValue } from './media-duration-reconciliation.helper';
import type {
  MediaLibraryLocation,
  MediaLibraryType,
} from '@yeen/shared-contracts';

export type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
export type * from './media.service.types';

import type {
  BulkAssignEpisodesInput,
  BulkDeleteMediaResult,
  MediaStorageSummary,
  PlaybackAudioTrack,
  RecycleDeletionsListResult,
  PurgeRecycleDeletionsResult,
  RemoteSeriesEpisodeCatalogResult,
  SeriesEpisodeTrackerResult,
  MetadataImportMode,
  MetadataExportImageAsset,
  MediaMetadataExportPayload,
  MediaMetadataImportResult,
  RemoteMediaProvider,
  MetadataImportPathContext,
} from './media.service.types';

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
  private readonly metadataOps: MediaMetadataOpsContext;
  private readonly catalogOps: MediaCatalogOpsContext;
  private readonly playbackOps: MediaPlaybackOpsContext;
  private readonly listOps: MediaListOpsContext;

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
    private readonly mediaScannerService: MediaScannerService,
  ) {
    this.metadataOps = {
      getById: (mediaId) => this.getById(mediaId),
      mediaStore: this.mediaStore,
      mediaMetadataIoService: this.mediaMetadataIoService,
      mediaMetadataImportNormalizerService:
        this.mediaMetadataImportNormalizerService,
      mediaMetadataPatchEnrichmentService:
        this.mediaMetadataPatchEnrichmentService,
      mediaMetadataPatchApplicationService:
        this.mediaMetadataPatchApplicationService,
      mediaEpisodeCatalogService: this.mediaEpisodeCatalogService,
      mediaMetadataArtworkRefreshService:
        this.mediaMetadataArtworkRefreshService,
      resolveMediaFilePath: (
        filePath: string,
        relativePath: string,
        providedContext?: MetadataImportPathContext,
      ) => this.resolveMediaFilePath(filePath, relativePath, providedContext),
    };

    this.catalogOps = {
      mediaEpisodeCatalogService: this.mediaEpisodeCatalogService,
      mediaPermanentDeleteService: this.mediaPermanentDeleteService,
      mediaRemoteCatalogService: this.mediaRemoteCatalogService,
      logger: this.logger,
    };

    this.playbackOps = {
      mediaScanStore: this.mediaScanStore,
      mediaFileResolutionService: this.mediaFileResolutionService,
      mediaScanExecutionService: this.mediaScanExecutionService,
      mediaPlaybackService: this.mediaPlaybackService,
      mediaImageStreamService: this.mediaImageStreamService,
      getById: (mediaId) => this.getById(mediaId),
    };

    this.listOps = {
      mediaStore: this.mediaStore,
    };
  }

  async getLocations() {
    return this.mediaLibraryLocationsService.getLocations();
  }

  async getStorageSummary(): Promise<MediaStorageSummary> {
    return this.mediaStorageSummaryService.summarizeStorage(
      await this.mediaFileResolutionService.resolveScanLocations(),
    );
  }

  async setLocations(locations: readonly (string | MediaLibraryLocation)[]) {
    return this.mediaLibraryLocationsService.setLocations(locations);
  }

  async list(
    search?: string,
    tags?: string[],
    libraryType: MediaLibraryType = 'video',
  ): Promise<MediaItem[]> {
    return listValue(this.listOps, search, tags, libraryType);
  }

  async getStats() {
    const items = await this.mediaStore.all();
    return {
      indexedItems: items.length,
      videoItems: items.filter((item) => item.libraryType === 'video').length,
      musicItems: items.filter((item) => item.libraryType === 'music').length,
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

  /**
   * Resolve the authoritative playback runtime for a media item by probing the
   * real source file, correcting the stored `durationSeconds` when it differs
   * from a complete source or when a growing partial source proves it is longer.
   *
   * The HLS manifest is built from this value, so a stored runtime shorter than
   * the file truncates the transcode and cuts playback off early, while a stored
   * runtime longer than a complete file creates an unplayable tail. Partial
   * sources retain the stored upper bound because their probe can under-report.
   */
  async reconcileSourceDurationSeconds(
    mediaId: string,
    sourceFilePath: string,
    options: { mayBePartial?: boolean } = {},
  ): Promise<number> {
    const item = await this.mediaStore.findById(mediaId);
    const storedDuration =
      item && Number.isFinite(item.durationSeconds) && item.durationSeconds > 0
        ? item.durationSeconds
        : 0;

    let probedDuration = 0;
    try {
      probedDuration =
        await this.mediaScannerService.probeDurationSeconds(sourceFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Source duration probe failed for ${mediaId} (${sourceFilePath}); using stored runtime. (${message})`,
      );
    }

    const reconciliation = reconcileDurationSecondsValue(
      storedDuration,
      probedDuration,
      options.mayBePartial ?? false,
    );
    if (item && reconciliation.correctedStoredDurationSeconds !== null) {
      const corrected: MediaItem = {
        ...item,
        durationSeconds: reconciliation.correctedStoredDurationSeconds,
      };
      corrected.dedupeKey =
        this.mediaMetadataPatchApplicationService.buildDedupeKey(corrected);
      await this.mediaStore.upsert(corrected);
      this.logger.log(
        `Corrected runtime for ${mediaId} from ${storedDuration}s to ${corrected.durationSeconds}s using source probe.`,
      );
      return corrected.durationSeconds;
    }

    return reconciliation.durationSeconds;
  }

  async getSeriesEpisodeTracker(
    mediaId: string,
  ): Promise<SeriesEpisodeTrackerResult> {
    const current = await this.getById(mediaId);

    return this.mediaEpisodeCatalogService.getSeriesEpisodeTracker(current);
  }

  async getRemoteSeriesEpisodeCatalog(
    remoteId: string,
  ): Promise<RemoteSeriesEpisodeCatalogResult> {
    const current = await this.getRemoteMediaById(remoteId);
    return this.mediaEpisodeCatalogService.getRemoteSeriesEpisodeCatalog(
      current,
    );
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
    return exportMetadataValue(this.metadataOps);
  }

  async importMetadata(input: {
    mode?: MetadataImportMode;
    items: unknown[];
    imageAssets?: Record<string, MetadataExportImageAsset> | null;
  }): Promise<MediaMetadataImportResult> {
    return importMetadataValue(this.metadataOps, input);
  }

  async importMetadataFromJson(input: {
    mode?: MetadataImportMode;
    rawJson: string;
  }): Promise<MediaMetadataImportResult> {
    return importMetadataFromJsonValue(this.metadataOps, input);
  }

  async updateMedia(
    mediaId: string,
    patch: MediaMetadataPatch,
  ): Promise<MediaItem> {
    return updateMediaValue(this.metadataOps, mediaId, patch);
  }

  async bulkDeleteMediaPermanently(
    mediaIds: string[],
  ): Promise<BulkDeleteMediaResult> {
    return bulkDeleteMediaPermanentlyValue(this.catalogOps, mediaIds);
  }

  async searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }) {
    return searchMetadataCandidatesValue(this.catalogOps, input);
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
    return searchRemoteMediaCatalogValue(this.catalogOps, input);
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    return getRemoteMediaByIdValue(this.catalogOps, remoteId);
  }

  async bulkAssignEpisodes(input: BulkAssignEpisodesInput): Promise<{
    updatedCount: number;
    items: MediaItem[];
  }> {
    return bulkAssignEpisodesValue(this.metadataOps, input);
  }

  async scan(
    libraryPath?: string,
    libraryPaths?: string[],
    libraryLocations?: MediaLibraryLocation[],
  ) {
    return scanValue(
      this.playbackOps,
      libraryPath,
      libraryPaths,
      libraryLocations,
    );
  }

  async getPlaybackAudioTracks(mediaId: string): Promise<PlaybackAudioTrack[]> {
    return getPlaybackAudioTracksValue(this.playbackOps, mediaId);
  }

  async getPlaybackPlan(mediaId: string) {
    return getPlaybackPlanValue(this.playbackOps, mediaId);
  }

  async streamPreviewImage(mediaId: string, response: Response): Promise<void> {
    await streamPreviewImageValue(this.playbackOps, mediaId, response);
  }

  async streamBackdropImage(
    mediaId: string,
    response: Response,
  ): Promise<void> {
    await streamBackdropImageValue(this.playbackOps, mediaId, response);
  }

  async streamChapterThumbnail(
    mediaId: string,
    index: number,
    response: Response,
  ): Promise<void> {
    await streamChapterThumbnailValue(
      this.playbackOps,
      mediaId,
      index,
      response,
    );
  }
}
