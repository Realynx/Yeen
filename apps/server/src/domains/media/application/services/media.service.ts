import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { readdir, rm, unlink } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
} from 'node:path';
import { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaScanProgress } from '../../domain/entities/media-scan-progress.entity';
import { MediaScanStore } from '../../infrastructure/stores/media-scan.store';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';
import { JikanMetadataService } from './remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from './remote-metadata/tmdb-metadata.service';
import { MediaPreviewResolver } from '../../infrastructure/resolvers/media-preview.resolver';
import {
  cleanTitle,
  normalizeForKey,
} from '../../infrastructure/helpers/title-normalizer';
import {
  detectFromFilenameAndPath,
  type FilenameDetectResult,
} from '../../infrastructure/helpers/filename-metadata';
import type { TorrentFileHint } from '../../../torrent/application/services/torrent.service';
import {
  readMediaFileHeader,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../core/infrastructure/shared/media-header-probe';
import { MediaFsFileOpsService } from './filesystem/media-fs-file-ops.service';
import { MediaTorrentIndexingService } from './torrent-intake/media-torrent-indexing.service';
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
import {
  exportMetadataValue,
  importMetadataFromJsonValue,
  importMetadataValue,
  updateMediaValue,
} from './media-service-metadata.helper';
import { bulkAssignEpisodesValue } from './media-service-bulk-assign.helper';
import {
  bulkDeleteMediaPermanentlyValue,
  getRemoteMediaByIdValue,
  searchMetadataCandidatesValue,
  searchRemoteMediaCatalogValue,
} from './media-service-catalog.helper';
import {
  getPlaybackAudioTracksValue,
  getPlaybackPlanValue,
  getTorrentDownloadProgressByMediaIdsValue,
  scanValue,
  streamBackdropImageValue,
  streamChapterThumbnailValue,
  streamPreviewImageValue,
} from './media-service-playback.helper';
import { listValue } from './media-service-list.helper';
import type { MediaMetadataOpsContext } from './media-service-metadata.helper';
import type { MediaCatalogOpsContext } from './media-service-catalog.helper';
import type { MediaPlaybackOpsContext } from './media-service-playback.helper';
import type { MediaListOpsContext } from './media-service-list.helper';

export type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
export type * from './media.service.types';

import type {
  BulkAssignEpisodesInput,
  DeletedMediaItemResult,
  BulkDeleteMediaResult,
  MediaTorrentDownloadProgressItem,
  MediaStorageSummary,
  PlaybackAudioTrack,
  RecycleDeletionsListResult,
  PurgeRecycleDeletionsResult,
  SeriesEpisodeTrackerResult,
  MetadataImportMode,
  MetadataExportImageAsset,
  MediaMetadataExportPayload,
  MediaMetadataImportResult,
  RemoteMediaProvider,
  ParsedRemoteMediaId,
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
    return listValue(this.listOpsContext(), search, tags);
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
    return exportMetadataValue(this.metadataOpsContext());
  }

  async importMetadata(input: {
    mode?: MetadataImportMode;
    items: unknown[];
    imageAssets?: Record<string, MetadataExportImageAsset> | null;
  }): Promise<MediaMetadataImportResult> {
    return importMetadataValue(this.metadataOpsContext(), input);
  }

  async importMetadataFromJson(input: {
    mode?: MetadataImportMode;
    rawJson: string;
  }): Promise<MediaMetadataImportResult> {
    return importMetadataFromJsonValue(this.metadataOpsContext(), input);
  }

  async updateMedia(
    mediaId: string,
    patch: MediaMetadataPatch,
  ): Promise<MediaItem> {
    return updateMediaValue(this.metadataOpsContext(), mediaId, patch);
  }

  async bulkDeleteMediaPermanently(
    mediaIds: string[],
  ): Promise<BulkDeleteMediaResult> {
    return bulkDeleteMediaPermanentlyValue(this.catalogOpsContext(), mediaIds);
  }

  async searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }) {
    return searchMetadataCandidatesValue(this.catalogOpsContext(), input);
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
    return searchRemoteMediaCatalogValue(this.catalogOpsContext(), input);
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    return getRemoteMediaByIdValue(this.catalogOpsContext(), remoteId);
  }

  async bulkAssignEpisodes(input: BulkAssignEpisodesInput): Promise<{
    updatedCount: number;
    items: MediaItem[];
  }> {
    return bulkAssignEpisodesValue(this.metadataOpsContext(), input);
  }

  async scan(libraryPath?: string, libraryPaths?: string[]) {
    return scanValue(this.playbackOpsContext(), libraryPath, libraryPaths);
  }

  async getPlaybackAudioTracks(mediaId: string): Promise<PlaybackAudioTrack[]> {
    return getPlaybackAudioTracksValue(this.playbackOpsContext(), mediaId);
  }

  async getPlaybackPlan(mediaId: string) {
    return getPlaybackPlanValue(this.playbackOpsContext(), mediaId);
  }

  async getTorrentDownloadProgressByMediaIds(
    mediaIds: string[],
  ): Promise<{ items: MediaTorrentDownloadProgressItem[] }> {
    return getTorrentDownloadProgressByMediaIdsValue(
      this.playbackOpsContext(),
      mediaIds,
    );
  }

  async streamPreviewImage(mediaId: string, response: Response): Promise<void> {
    await streamPreviewImageValue(this.playbackOpsContext(), mediaId, response);
  }

  async streamBackdropImage(
    mediaId: string,
    response: Response,
  ): Promise<void> {
    await streamBackdropImageValue(this.playbackOpsContext(), mediaId, response);
  }

  async streamChapterThumbnail(
    mediaId: string,
    index: number,
    response: Response,
  ): Promise<void> {
    await streamChapterThumbnailValue(
      this.playbackOpsContext(),
      mediaId,
      index,
      response,
    );
  }

  private metadataOpsContext(): MediaMetadataOpsContext {
    return {
      getById: (mediaId) => this.getById(mediaId),
      mediaStore: this.mediaStore,
      mediaMetadataIoService: this.mediaMetadataIoService,
      mediaMetadataImportNormalizerService: this.mediaMetadataImportNormalizerService,
      mediaMetadataPatchEnrichmentService: this.mediaMetadataPatchEnrichmentService,
      mediaMetadataPatchApplicationService: this.mediaMetadataPatchApplicationService,
      mediaEpisodeCatalogService: this.mediaEpisodeCatalogService,
      mediaMetadataArtworkRefreshService: this.mediaMetadataArtworkRefreshService,
      resolveMediaFilePath: (
        filePath: string,
        relativePath: string,
        providedContext?: MetadataImportPathContext,
      ) => this.resolveMediaFilePath(filePath, relativePath, providedContext),
    };
  }

  private catalogOpsContext(): MediaCatalogOpsContext {
    return {
      mediaEpisodeCatalogService: this.mediaEpisodeCatalogService,
      mediaPermanentDeleteService: this.mediaPermanentDeleteService,
      mediaRemoteCatalogService: this.mediaRemoteCatalogService,
      logger: this.logger,
    };
  }

  private playbackOpsContext(): MediaPlaybackOpsContext {
    return {
      mediaScanStore: this.mediaScanStore,
      mediaFileResolutionService: this.mediaFileResolutionService,
      mediaScanExecutionService: this.mediaScanExecutionService,
      mediaPlaybackService: this.mediaPlaybackService,
      mediaImageStreamService: this.mediaImageStreamService,
      getById: (mediaId) => this.getById(mediaId),
    };
  }

  private listOpsContext(): MediaListOpsContext {
    return {
      mediaStore: this.mediaStore,
    };
  }
}



