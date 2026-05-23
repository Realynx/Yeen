import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import {
  mkdir,
  readFile as readFileBuffer,
  readdir,
  rm,
  statfs,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { lookup } from 'mime-types';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { MediaAiMetadataService } from './media-ai-metadata.service';
import {
  MediaItem,
  SeriesAssignmentRules,
} from '../../domain/entities/media-item.entity';
import { MediaScanProgress } from '../../domain/entities/media-scan-progress.entity';
import { MediaLocationsStore } from '../../infrastructure/stores/media-locations.store';
import { MediaScanStore } from '../../infrastructure/stores/media-scan.store';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MediaProbeAdapter } from '../../infrastructure/adapters/media-probe.adapter';
import {
  MediaScannerService,
  type MediaProbeHint,
} from './media-scanner.service';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';
import {
  JikanMetadataService,
  type JikanRemoteCandidate,
} from './jikan-metadata.service';
import {
  TmdbMetadataService,
  type TmdbRemoteCandidate,
} from './tmdb-metadata.service';
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
  TorrentService,
  type TorrentFileHint,
  type TorrentListItem,
} from '../../../torrent/application/services/torrent.service';
import { TorrentMediaIndexStore } from '../../../torrent/infrastructure/stores/torrent-media-index.store';
import {
  readMediaFileHeader,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../core/infrastructure/shared/media-header-probe';
import { MediaFsFileOpsService } from './media-fs-file-ops.service';
import { MediaPathResolverService } from './media-path-resolver.service';

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
  remoteSource?: 'tmdb' | 'jikan' | null;
  remoteSourceId?: string | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
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

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

interface ParsedRemoteMediaId {
  provider: RemoteMediaProvider;
  mediaType: 'movie' | 'show';
  providerId: string;
}

interface MetadataImportPathContext {
  roots: string[];
  rootByLabel: Map<string, string>;
}

interface ResolvedMediaLocationPath {
  absoluteFilePath: string;
  locationRoot: string;
  locationLabel: string;
  relativePathUnderLocation: string;
}

interface RemoteSelectionRef {
  provider: RemoteMediaProvider;
  providerId: string;
}

interface EnrichedMetadataPatchResult {
  effectivePatch: MediaMetadataPatch;
  remoteSelectionChanged: boolean;
  remoteCandidate: RemoteMediaCandidate | null;
}

interface RebuiltArtworkResult {
  previewImagePath: string | null;
  backdropImagePath: string | null;
  chapterThumbnails: MediaItem['chapterThumbnails'];
}

interface EpisodeCatalogLink {
  source: 'jikan' | 'tmdb';
  providerId: string;
}

interface NormalizedSeriesCatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string | null;
}

interface NormalizedSeriesEpisodeCatalog {
  source: 'jikan' | 'tmdb';
  providerId: string;
  totalEpisodeCount: number;
  episodes: NormalizedSeriesCatalogEpisode[];
  updatedAt: string;
}

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private static readonly ACTIVE_TORRENT_DOWNLOAD_STATES = new Set([
    'downloading',
    'forceddl',
    'stalldl',
    'stalleddl',
    'metadl',
    'queueddl',
    'checkingdl',
  ]);
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
  private readonly recycleRootFolderName = '.yeen-recycle';
  private readonly recycleDeleteCategoryName = 'media-deletions';
  private readonly automaticTorrentIntakePollMs = 20_000;
  private readonly automaticTorrentIntakeBatchSize = 8;
  private readonly automaticTorrentRefreshCooldownMs = 60_000;
  private readonly logger = new Logger(MediaService.name);
  /**
   * Throttle map: last time we logged a head-byte-gate diagnostic for a given
   * torrent hash. The prepare-page status endpoint polls every ~2s, so we
   * rate-limit verbose diagnostic warnings to once every 10s per hash.
   */
  private readonly lastHeadGateLogAtMsByHash = new Map<string, number>();
  /**
   * Throttle expensive fallback directory walks per torrent hash. Without
   * this, a misconfigured save root can trigger a capped walk every poll.
   */
  private readonly lastFallbackWalkAtMsByHash = new Map<string, number>();
  private automaticTorrentIntakeTimer: NodeJS.Timeout | null = null;
  private automaticTorrentIntakeRunning = false;

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly mediaScanStore: MediaScanStore,
    private readonly scanner: MediaScannerService,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly configService: ConfigService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mediaAiMetadataService: MediaAiMetadataService,
    private readonly metadataApiCacheStore: MetadataApiCacheStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly mediaPreviewResolver: MediaPreviewResolver,
    private readonly mediaFsFileOpsService: MediaFsFileOpsService,
    private readonly mediaPathResolver: MediaPathResolverService,
    private readonly torrentService: TorrentService,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
  ) {}

  onModuleInit(): void {
    this.automaticTorrentIntakeTimer = setInterval(() => {
      void this.runAutomaticTorrentIntakePoll();
    }, this.automaticTorrentIntakePollMs);

    this.automaticTorrentIntakeTimer.unref?.();
    void this.runAutomaticTorrentIntakePoll();
  }

  onModuleDestroy(): void {
    this.stopAutomaticTorrentIntakePolling();
  }

  private stopAutomaticTorrentIntakePolling(): void {
    if (!this.automaticTorrentIntakeTimer) {
      return;
    }

    clearInterval(this.automaticTorrentIntakeTimer);
    this.automaticTorrentIntakeTimer = null;
  }

  private async runAutomaticTorrentIntakePoll(): Promise<void> {
    if (this.automaticTorrentIntakeRunning) {
      return;
    }

    if (this.mediaScanStore.get().status === 'running') {
      return;
    }

    this.automaticTorrentIntakeRunning = true;

    try {
      const listResult = await this.torrentService.listTorrents();
      const torrents = Array.isArray(listResult.items) ? listResult.items : [];
      if (torrents.length === 0) {
        return;
      }

      const candidates = torrents
        .filter(
          (item) =>
            typeof item.hash === 'string' && item.hash.trim().length > 0,
        )
        .sort((left, right) => {
          const leftComplete = left.progress >= 0.999;
          const rightComplete = right.progress >= 0.999;

          if (leftComplete !== rightComplete) {
            return leftComplete ? 1 : -1;
          }

          if (left.progress !== right.progress) {
            return right.progress - left.progress;
          }

          return left.name.localeCompare(right.name, undefined, {
            sensitivity: 'base',
          });
        })
        .slice(0, this.automaticTorrentIntakeBatchSize);

      for (const candidate of candidates) {
        const normalizedHash = candidate.hash.trim().toLowerCase();
        if (!normalizedHash) {
          continue;
        }

        try {
          const existingMapping =
            await this.torrentMediaIndexStore.get(normalizedHash);
          if (existingMapping) {
            const existingMedia = await this.mediaStore.findById(
              existingMapping.mediaId,
            );
            if (existingMedia) {
              const existsOnDisk = await this.fileExists(
                existingMedia.filePath,
              );
              if (!existsOnDisk) {
                await this.torrentMediaIndexStore.remove(normalizedHash);
              } else {
                const shouldRefresh =
                  this.shouldRefreshIndexedItem(existingMedia) &&
                  this.isMetadataRefreshOlderThan(
                    existingMedia,
                    this.automaticTorrentRefreshCooldownMs,
                  );

                if (shouldRefresh) {
                  await this.refreshIndexedMediaItem(existingMedia);
                }

                continue;
              }
            } else {
              await this.torrentMediaIndexStore.remove(normalizedHash);
            }
          }

          await this.indexTorrentFile(normalizedHash);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.debug(
            `Automatic intake failed for torrent ${normalizedHash}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Automatic torrent intake poll failed: ${message}`);
    } finally {
      this.automaticTorrentIntakeRunning = false;
    }
  }

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

  async getStorageSummary(): Promise<MediaStorageSummary> {
    const scanLocations = await this.resolveScanLocations();
    const storageSourcePaths =
      await this.collectStorageSourcePaths(scanLocations);

    let totalBytes = 0;
    let usedBytes = 0;
    let availableBytes = 0;
    let driveCount = 0;
    let unavailableDriveCount = 0;

    for (const sourcePath of storageSourcePaths) {
      const snapshot = await this.readDriveStorageSnapshot(sourcePath);
      if (!snapshot) {
        unavailableDriveCount += 1;
        continue;
      }

      driveCount += 1;
      totalBytes += snapshot.totalBytes;
      usedBytes += snapshot.usedBytes;
      availableBytes += snapshot.availableBytes;
    }

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: this.toPercent(usedBytes, totalBytes),
      driveCount,
      unavailableDriveCount,
      asOf: new Date().toISOString(),
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

  async getSeriesEpisodeTracker(
    mediaId: string,
  ): Promise<SeriesEpisodeTrackerResult> {
    const current = await this.getById(mediaId);

    if (current.isRemote) {
      return {
        status: 'unavailable',
        reason: 'Series tracker is only available for indexed library items.',
        source: null,
      };
    }

    if (current.type !== 'show') {
      return {
        status: 'unavailable',
        reason: 'Series tracker is only available for show entries.',
        source: null,
      };
    }

    const catalogLink = this.resolveEpisodeCatalogLink(current);
    if (!catalogLink) {
      return {
        status: 'unavailable',
        reason:
          'No linked series catalog match is available yet. Re-run indexing or choose a TMDB/Jikan match in metadata edit first.',
        source: null,
      };
    }

    const catalog = await this.loadSeriesEpisodeCatalog(catalogLink);
    if (!catalog || catalog.episodes.length === 0) {
      const sourceLabel = this.remoteSourceLabel(catalogLink.source);
      return {
        status: 'unavailable',
        reason: `Episode catalog could not be loaded from ${sourceLabel} for this series.`,
        source: null,
      };
    }

    const allItems = await this.mediaStore.all();
    const seriesItems = this.collectSeriesItemsForEpisodeTracker(
      allItems,
      current,
      catalogLink,
    );

    const seasonNumbers = new Set<number>();
    const localEpisodesBySeason = new Map<number, Set<number>>();

    for (const item of seriesItems) {
      if (item.type !== 'show') {
        continue;
      }

      const episode = this.coercePositiveEpisodeNumber(item.episodeNumber);
      if (!episode) {
        continue;
      }

      const season = this.coerceSeasonForTracker(item.seasonNumber);
      seasonNumbers.add(season);

      const existingSeasonEpisodes =
        localEpisodesBySeason.get(season) ?? new Set<number>();
      existingSeasonEpisodes.add(episode);
      localEpisodesBySeason.set(season, existingSeasonEpisodes);
    }

    const seasonsSeen = [...seasonNumbers].sort((left, right) => left - right);
    const expectedSeasons = [
      ...new Set(catalog.episodes.map((episode) => episode.seasonNumber)),
    ].sort((left, right) => left - right);
    const preferredSeasonNumber = this.coerceSeasonForTracker(
      current.seasonNumber,
    );
    const primarySeasonNumber = expectedSeasons.includes(preferredSeasonNumber)
      ? preferredSeasonNumber
      : (expectedSeasons[0] ?? seasonsSeen[0] ?? 1);

    const missingSeasons = expectedSeasons.filter(
      (seasonNumber) => !localEpisodesBySeason.has(seasonNumber),
    );

    const missingEpisodes = catalog.episodes
      .filter((episode) => {
        const localSeasonEpisodes = localEpisodesBySeason.get(
          episode.seasonNumber,
        );
        return !localSeasonEpisodes?.has(episode.episodeNumber);
      })
      .map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
      }));

    const expectedEpisodeCount = Math.max(
      catalog.totalEpisodeCount,
      catalog.episodes.length,
    );
    const collectedEpisodeCount = Math.max(
      0,
      expectedEpisodeCount - missingEpisodes.length,
    );
    const missingEpisodeCount = missingEpisodes.length;
    const completionPercent =
      expectedEpisodeCount > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round((collectedEpisodeCount / expectedEpisodeCount) * 100),
            ),
          )
        : 0;
    const extraSeasons = seasonsSeen.filter(
      (season) => !expectedSeasons.includes(season),
    );
    const isComplete = missingSeasons.length === 0 && missingEpisodeCount === 0;
    const sourceLabel = this.remoteSourceLabel(catalog.source);

    return {
      status: 'ready',
      source: catalog.source,
      sourceLabel,
      providerId: catalog.providerId,
      isComplete,
      completionPercent,
      expectedEpisodeCount,
      collectedEpisodeCount,
      missingEpisodeCount,
      primarySeasonNumber,
      seasonsSeen,
      extraSeasons,
      missingSeasons,
      missingEpisodes,
      updatedAt: catalog.updatedAt,
      note:
        expectedSeasons.length > 1
          ? `Multiple seasons are tracked against the linked ${sourceLabel} episode catalog.`
          : extraSeasons.length > 0
            ? `Local episodes include seasons outside the linked ${sourceLabel} catalog.`
            : null,
    };
  }

  async resolveMediaFilePath(
    filePath: string,
    relativePath: string,
    providedContext?: MetadataImportPathContext,
  ): Promise<string> {
    const context = providedContext ?? (await this.createImportPathContext());
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      filePath,
      relativePath,
      context,
    );

    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    const fuzzyResolved = await this.mediaPathResolver.resolveRelativePathFuzzy(
      relativePath,
      context,
    );
    if (fuzzyResolved) {
      return fuzzyResolved;
    }

    throw new NotFoundException('Unable to resolve media file path.');
  }

  async indexTorrentFile(
    hash: string,
  ): Promise<
    | { status: 'indexed'; media: MediaItem }
    | { status: 'pending'; reason: string }
  > {
    const normalizedHash = hash.trim();
    if (!normalizedHash) {
      throw new BadRequestException('Torrent hash is required.');
    }

    // Fast-path: if this hash has already been indexed previously, return the
    // existing media record without touching qBittorrent. Only invalidate the
    // mapping when the underlying file no longer exists on disk -- the torrent
    // itself may come and go in qBittorrent without affecting the library.
    const previouslyIndexed =
      await this.torrentMediaIndexStore.get(normalizedHash);
    if (previouslyIndexed) {
      const cachedMedia = await this.mediaStore.findById(
        previouslyIndexed.mediaId,
      );
      if (cachedMedia) {
        const stillOnDisk = await this.fileExists(cachedMedia.filePath);
        if (stillOnDisk) {
          return { status: 'indexed', media: cachedMedia };
        }
        this.logger.warn(
          `Torrent ${normalizedHash} previously indexed as ${cachedMedia.id} ` +
            `but file is missing on disk (${cachedMedia.filePath}); dropping mapping.`,
        );
        await this.torrentMediaIndexStore.remove(normalizedHash);
      } else {
        // Media record was deleted manually; clear the stale mapping so the
        // next probe can re-index from scratch.
        await this.torrentMediaIndexStore.remove(normalizedHash);
      }
    }

    const torrentPaths = await this.torrentService
      .getTorrentPaths(normalizedHash)
      .catch((error) => {
        if (
          error instanceof BadGatewayException ||
          error instanceof GatewayTimeoutException
        ) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `qBittorrent unreachable during torrent index poll (paths). hash=${normalizedHash}: ${message}`,
          );
          return null;
        }
        throw error;
      });

    if (!torrentPaths) {
      return {
        status: 'pending',
        reason:
          'qBittorrent is temporarily unreachable. Retrying automatically...',
      };
    }

    const savePath =
      torrentPaths.savePath ??
      (torrentPaths.contentPath ? dirname(torrentPaths.contentPath) : null);
    if (!savePath) {
      return {
        status: 'pending',
        reason: 'qBittorrent has not assigned a save path to this torrent yet.',
      };
    }

    const qbFiles = await this.torrentService
      .getTorrentFiles(normalizedHash)
      .catch((error) => {
        if (
          error instanceof BadGatewayException ||
          error instanceof GatewayTimeoutException
        ) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `qBittorrent unreachable during torrent index poll (files). hash=${normalizedHash}: ${message}`,
          );
          return null;
        }
        throw error;
      });

    if (qbFiles === null) {
      return {
        status: 'pending',
        reason:
          'qBittorrent is temporarily unreachable. Retrying automatically...',
      };
    }

    const files = this.mergeTorrentFileHints(
      qbFiles,
      await this.torrentService.getKnownTorrentFiles(normalizedHash),
    );

    if (files.length === 0) {
      return {
        status: 'pending',
        reason: 'qBittorrent has not reported any files for this torrent yet.',
      };
    }

    const videoExtensions = new Set([
      '.mp4',
      '.m4v',
      '.mkv',
      '.mov',
      '.avi',
      '.webm',
    ]);
    const candidateFiles = this.rankTorrentVideoCandidates(
      files.filter((file) =>
        videoExtensions.has(extname(file.name).toLowerCase()),
      ),
    );

    if (candidateFiles.length === 0) {
      return {
        status: 'pending',
        reason: 'No playable video file detected inside the torrent.',
      };
    }
    const [titleHint, mediaHint] = await Promise.all([
      this.torrentService.getKnownTorrentTitleHint(normalizedHash),
      this.torrentService.getKnownTorrentMediaHint(normalizedHash),
    ]);
    const probeHint: MediaProbeHint | undefined = mediaHint
      ? {
          ...mediaHint,
          title: mediaHint.title || titleHint || undefined,
          normalizedTitle: mediaHint.normalizedTitle || titleHint || undefined,
        }
      : titleHint
        ? {
            title: titleHint,
            normalizedTitle: titleHint,
          }
        : undefined;

    const indexedByFilePath = new Map<string, MediaItem>();
    let primaryReadyMedia: MediaItem | null = null;
    let primaryPendingReason: string | null = null;

    for (let i = 0; i < candidateFiles.length; i += 1) {
      const candidate = candidateFiles[i];
      const isPrimaryCandidate = i === 0;
      const candidateBaseName = basename(candidate.name);
      const candidateFileName = basename(
        candidate.name,
        extname(candidate.name),
      );
      const candidateDetection = detectFromFilenameAndPath(
        candidateFileName,
        candidate.name,
      );

      const absoluteFileCandidates =
        this.mediaPathResolver.buildTorrentAbsoluteFileCandidates({
          savePath,
          contentPath: torrentPaths.contentPath,
          torrentRelativePath: candidate.name,
        });
      const existing = await this.findIndexedMediaByFilePathCandidates(
        absoluteFileCandidates,
      );
      if (existing) {
        if (isPrimaryCandidate) {
          const existingStats = await stat(existing.filePath).catch(() => null);
          if (!existingStats || !existingStats.isFile()) {
            primaryPendingReason =
              'Waiting for the first episode file to become readable on disk.';
            continue;
          }

          const existingHeader = await this.readFileHeader(
            existing.filePath,
            16,
          );
          const existingHeaderScore = this.scoreMediaHeader(
            existingHeader,
            existingStats.size,
          );
          if (existingHeaderScore < 100) {
            primaryPendingReason =
              existingHeader === null
                ? 'Waiting for the first episode file to become readable on disk.'
                : existingHeaderScore <= 0
                  ? 'Waiting for the downloader to flush the first episode piece to disk.'
                  : 'Waiting for a recognizable video container header to appear at the start of the first episode.';
            continue;
          }
        }

        indexedByFilePath.set(existing.filePath.toLowerCase(), existing);
        if (isPrimaryCandidate) {
          primaryReadyMedia = existing;
        }
        continue;
      }

      let allocated = await this.findAllocatedTorrentFileCandidate(
        absoluteFileCandidates,
      );

      if (
        !allocated &&
        this.shouldAttemptFallbackWalk(normalizedHash, 10_000)
      ) {
        const searchRoots = this.collectTorrentSearchRoots({
          savePath,
          contentPath: torrentPaths.contentPath,
        });
        const discovered = await this.discoverTorrentFileByWalk(
          searchRoots,
          candidateBaseName,
        );

        if (discovered) {
          this.logger.log(
            `Discovered torrent file via fallback walk: ${discovered.probePath} (expected basename ${candidateBaseName})`,
          );
          allocated = discovered;
        }
      }

      if (!allocated) {
        if (isPrimaryCandidate) {
          this.logger.warn(
            `Torrent file not yet allocated on disk. hash=${normalizedHash} ` +
              `savePath=${savePath} contentPath=${torrentPaths.contentPath ?? '(none)'} ` +
              `expected=${candidate.name} candidates=${JSON.stringify(absoluteFileCandidates)}`,
          );
          primaryPendingReason =
            'Waiting for qBittorrent to allocate the first episode on disk. ' +
            'If this keeps happening, check qBittorrent path mapping in Settings -> System.';
        }
        continue;
      }

      let { canonicalPath, probePath, fileStats } = allocated;
      const libraryRoot = await this.resolveLibraryRootForFile(
        canonicalPath,
        savePath,
      );
      const upsertProvisional = async (): Promise<MediaItem> => {
        const provisional = this.buildProvisionalTorrentMediaItem({
          canonicalPath,
          libraryRoot,
          fileSizeBytes: fileStats.size,
          fallbackTitle: candidateFileName,
          probeHint,
          relativePathHint: candidate.name,
          mediaTypeHint: candidateDetection.suggestedType,
          seasonNumberHint: candidateDetection.seasonNumber,
          episodeNumberHint: candidateDetection.episodeNumber,
          episodeTitleHint: candidateDetection.episodeTitle,
        });
        await this.mediaStore.upsert(provisional);
        const stored = await this.mediaStore.findByFilePath(canonicalPath);
        return stored ?? provisional;
      };

      const minBytesForProbe = Math.min(
        candidate.size > 0
          ? Math.max(4 * 1024 * 1024, candidate.size * 0.01)
          : 4 * 1024 * 1024,
        32 * 1024 * 1024,
      );
      if (fileStats.size < minBytesForProbe) {
        if (isPrimaryCandidate) {
          primaryPendingReason = `Waiting for enough of the first episode to download (${fileStats.size} / ~${Math.round(minBytesForProbe)} bytes).`;
          continue;
        }

        const provisional = await upsertProvisional();
        indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
        continue;
      }

      let headerBytes = await this.readFileHeader(probePath, 16);
      let headerScore = this.scoreMediaHeader(headerBytes, fileStats.size);

      if (
        headerScore <= 0 &&
        this.shouldAttemptFallbackWalk(normalizedHash, 10_000)
      ) {
        const searchRoots = this.collectTorrentSearchRoots({
          savePath,
          contentPath: torrentPaths.contentPath,
        });
        const discovered = await this.discoverTorrentFileByWalk(
          searchRoots,
          candidateBaseName,
        );
        if (
          discovered &&
          !this.arePathsEquivalent(discovered.probePath, probePath)
        ) {
          const discoveredHeaderBytes = await this.readFileHeader(
            discovered.probePath,
            16,
          );
          const discoveredHeaderScore = this.scoreMediaHeader(
            discoveredHeaderBytes,
            discovered.fileStats.size,
          );
          if (discoveredHeaderScore > headerScore) {
            this.logger.log(
              `Switched torrent probe path for ${normalizedHash} to ${discovered.probePath} ` +
                `(previous ${probePath} score=${headerScore}, discovered score=${discoveredHeaderScore}).`,
            );
            canonicalPath = discovered.canonicalPath;
            probePath = discovered.probePath;
            fileStats = discovered.fileStats;
            headerBytes = discoveredHeaderBytes;
            headerScore = discoveredHeaderScore;
          }
        }
      }

      if (headerScore < 100) {
        await this.logHeadGateDiagnostic({
          hash: normalizedHash,
          probePath,
          headerBytes,
          headerScore,
          fileSize: fileStats.size,
        });
        if (isPrimaryCandidate) {
          primaryPendingReason =
            headerBytes === null
              ? 'Waiting for the first episode file to become readable on disk.'
              : headerScore <= 0
                ? 'Waiting for the downloader to flush the first episode piece to disk.'
                : 'Waiting for a recognizable video container header to appear at the start of the first episode.';
          continue;
        }

        const provisional = await upsertProvisional();
        indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
        continue;
      }

      let probed: MediaItem;
      try {
        probed = await this.scanner.probeFile(
          probePath,
          libraryRoot,
          probeHint,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Probe failed for torrent file ${probePath}: ${message}`,
        );

        if (headerScore > 0 && this.isRecoverableTorrentProbeError(message)) {
          if (isPrimaryCandidate) {
            primaryPendingReason =
              'Waiting for first-episode metadata probe to stabilize while the file grows.';
            continue;
          }

          const provisional = await upsertProvisional();
          indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);

          this.logger.warn(
            `Using provisional torrent metadata for ${normalizedHash} at ${canonicalPath} while probe errors are recoverable.`,
          );
          continue;
        }

        const shortMessage =
          message.length > 220 ? `${message.slice(0, 220)}…` : message;
        if (isPrimaryCandidate) {
          primaryPendingReason = `Video header is not yet readable; waiting for more data. (probe: ${shortMessage})`;
        }
        continue;
      }

      if (
        !Number.isFinite(probed.durationSeconds) ||
        probed.durationSeconds <= 0
      ) {
        if (isPrimaryCandidate) {
          primaryPendingReason =
            'Probed first episode does not yet expose a duration; waiting for more data.';
          continue;
        }

        const provisional = await upsertProvisional();
        indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
        continue;
      }

      if (probePath !== canonicalPath) {
        probed.filePath = canonicalPath;
        probed.relativePath = relative(libraryRoot, canonicalPath)
          .split(sep)
          .join('/');
        probed.extension = extname(canonicalPath).toLowerCase();
      }

      await this.mediaStore.upsert(probed);
      const stored = await this.mediaStore.findByFilePath(canonicalPath);
      const result = stored ?? probed;
      indexedByFilePath.set(canonicalPath.toLowerCase(), result);

      if (isPrimaryCandidate) {
        primaryReadyMedia = result;
      }
    }

    if (primaryReadyMedia) {
      await this.rememberTorrentMediaMapping(normalizedHash, primaryReadyMedia);
      return { status: 'indexed', media: primaryReadyMedia };
    }

    if (!primaryPendingReason && indexedByFilePath.size > 0) {
      primaryPendingReason =
        'Indexed additional videos from this torrent; waiting for the first episode to become stream-ready.';
    }

    if (primaryPendingReason) {
      return {
        status: 'pending',
        reason: primaryPendingReason,
      };
    }

    return {
      status: 'pending',
      reason:
        'Waiting for the first episode in this torrent to become readable on disk.',
    };
  }

  private async rememberTorrentMediaMapping(
    hash: string,
    media: MediaItem,
  ): Promise<void> {
    try {
      await this.torrentMediaIndexStore.upsert({
        hash: hash.toLowerCase(),
        mediaId: media.id,
        filePath: media.filePath,
        indexedAtMs: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to persist torrent-media mapping for ${hash} -> ${media.id}: ${message}`,
      );
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private arePathsEquivalent(leftPath: string, rightPath: string): boolean {
    return resolve(leftPath).toLowerCase() === resolve(rightPath).toLowerCase();
  }

  private isRecoverableTorrentProbeError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('invalid data found') ||
      normalized.includes('end of file') ||
      normalized.includes('error reading') ||
      normalized.includes('moov atom not found')
    );
  }

  private buildProvisionalTorrentMediaItem(input: {
    canonicalPath: string;
    libraryRoot: string;
    fileSizeBytes: number;
    fallbackTitle: string;
    probeHint?: MediaProbeHint;
    relativePathHint?: string;
    mediaTypeHint?: 'show' | 'other' | null;
    seasonNumberHint?: number | null;
    episodeNumberHint?: number | null;
    episodeTitleHint?: string | null;
  }): MediaItem {
    const now = new Date().toISOString();
    const extension = extname(input.canonicalPath).toLowerCase();
    const hintedTitle = input.probeHint?.title?.trim() ?? '';
    const title =
      hintedTitle || cleanTitle(input.fallbackTitle) || input.fallbackTitle;
    const normalizedTitle = normalizeForKey(title);
    const relativePath = (
      input.relativePathHint || relative(input.libraryRoot, input.canonicalPath)
    )
      .split(sep)
      .join('/');
    const filenameDetection = detectFromFilenameAndPath(
      basename(input.canonicalPath, extname(input.canonicalPath)),
      relativePath,
    );
    const fallbackMediaType =
      input.mediaTypeHint === 'show' || input.mediaTypeHint === 'other'
        ? input.mediaTypeHint
        : filenameDetection.suggestedType;
    const mediaType =
      input.probeHint?.mediaType === 'movie' ||
      input.probeHint?.mediaType === 'show' ||
      input.probeHint?.mediaType === 'other'
        ? input.probeHint.mediaType
        : fallbackMediaType === 'show'
          ? 'show'
          : fallbackMediaType === 'other'
            ? 'other'
            : 'other';
    const releaseYear =
      typeof input.probeHint?.releaseYear === 'number' &&
      Number.isFinite(input.probeHint.releaseYear)
        ? Math.floor(input.probeHint.releaseYear)
        : null;
    const estimatedBitRate = this.estimateProvisionalBitRate(
      input.fileSizeBytes,
    );
    const durationSeconds = this.estimateProvisionalDurationSeconds(
      input.fileSizeBytes,
      estimatedBitRate,
    );
    const tags = this.normalizeProvisionalTags(input.probeHint?.tags);
    const seasonNumber =
      mediaType === 'show'
        ? (input.seasonNumberHint ?? filenameDetection.seasonNumber ?? null)
        : null;
    const episodeNumber =
      mediaType === 'show'
        ? (input.episodeNumberHint ?? filenameDetection.episodeNumber ?? null)
        : null;
    const episodeTitle =
      mediaType === 'show'
        ? (input.episodeTitleHint ?? filenameDetection.episodeTitle ?? null)
        : null;

    return {
      id: randomUUID(),
      title,
      normalizedTitle,
      tags,
      description: input.probeHint?.description?.trim() || null,
      releaseYear,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      dedupeKey: this.buildProvisionalDedupeKey({
        mediaType,
        normalizedTitle,
        releaseYear,
        seasonNumber,
        episodeNumber,
        durationSeconds,
      }),
      relativePath,
      filePath: input.canonicalPath,
      extension,
      container: extension ? extension.slice(1) : null,
      type: mediaType,
      digitalMediaType: 'video',
      sizeBytes: input.fileSizeBytes,
      durationSeconds,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      subtitleStreams: 0,
      subtitleDetails: [],
      previewImagePath: null,
      backdropImagePath: null,
      chapterThumbnails: [],
      mediaDetails: {
        formatName: extension ? extension.slice(1) : null,
        bitRate: estimatedBitRate,
        frameRate: null,
        audioChannels: null,
      },
      metadataRefreshedAt: now,
      updatedAt: now,
    };
  }

  private normalizeProvisionalTags(tags: string[] | undefined): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const deduped = new Map<string, string>();
    for (const value of tags) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, trimmed);
      }
    }

    return [...deduped.values()].sort((a, b) => a.localeCompare(b));
  }

  private estimateProvisionalBitRate(fileSizeBytes: number): number {
    const gib = fileSizeBytes / (1024 * 1024 * 1024);
    if (gib >= 10) {
      return 18_000_000;
    }
    if (gib >= 6) {
      return 14_000_000;
    }
    if (gib >= 3) {
      return 10_000_000;
    }
    if (gib >= 1.5) {
      return 7_000_000;
    }
    return 4_000_000;
  }

  private estimateProvisionalDurationSeconds(
    fileSizeBytes: number,
    bitRate: number,
  ): number {
    if (bitRate <= 0 || fileSizeBytes <= 0) {
      return 2 * 60 * 60;
    }

    const estimated = (fileSizeBytes * 8) / bitRate;
    if (!Number.isFinite(estimated) || estimated <= 0) {
      return 2 * 60 * 60;
    }

    return Math.max(20 * 60, Math.min(6 * 60 * 60, estimated));
  }

  private buildProvisionalDedupeKey(input: {
    mediaType: 'movie' | 'show' | 'other';
    normalizedTitle: string;
    releaseYear: number | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    durationSeconds: number;
  }): string {
    const safeTitle = input.normalizedTitle || 'untitled';

    if (input.mediaType === 'show') {
      return `show:${safeTitle}:s${input.seasonNumber ?? 0}:e${input.episodeNumber ?? 0}`;
    }

    if (input.mediaType === 'movie') {
      return `movie:${safeTitle}:y${input.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(input.durationSeconds / 300));
    return `other:${safeTitle}:y${input.releaseYear ?? 0}:d${durationBucket}`;
  }

  private shouldAttemptFallbackWalk(
    hash: string,
    minIntervalMs: number,
  ): boolean {
    const now = Date.now();
    const lastAttempt = this.lastFallbackWalkAtMsByHash.get(hash) ?? 0;
    if (now - lastAttempt < minIntervalMs) {
      return false;
    }
    this.lastFallbackWalkAtMsByHash.set(hash, now);
    return true;
  }

  private async findIndexedMediaByFilePathCandidates(
    absoluteFileCandidates: string[],
  ): Promise<MediaItem | null> {
    for (const absoluteFilePath of absoluteFileCandidates) {
      const existing = await this.mediaStore.findByFilePath(absoluteFilePath);
      if (existing) {
        return existing;
      }
    }

    return null;
  }

  private async findAllocatedTorrentFileCandidate(
    absoluteFileCandidates: string[],
  ): Promise<{
    /** Canonical path without .!qB — what will be stored in the media record. */
    canonicalPath: string;
    /** Actual path on disk right now (may include .!qB while downloading). */
    probePath: string;
    fileStats: Stats;
  } | null> {
    // Collect every candidate that exists on disk (canonical OR .!qB partial).
    // We then score them by whether the first bytes look like a real media
    // header — this avoids the failure mode where multiple test runs have
    // left zero-filled pre-allocated files at several candidate paths and we
    // probe a dead one instead of the file qBittorrent is actively writing.
    type Allocated = {
      canonicalPath: string;
      probePath: string;
      fileStats: Stats;
    };

    const allocated: Allocated[] = [];

    for (const absoluteFilePath of absoluteFileCandidates) {
      try {
        const fileStats = await stat(absoluteFilePath);
        if (fileStats.isFile()) {
          allocated.push({
            canonicalPath: absoluteFilePath,
            probePath: absoluteFilePath,
            fileStats,
          });
        }
      } catch {
        // canonical path doesn't exist; try .!qB variant.
      }

      const inProgressPath = absoluteFilePath + '.!qB';
      try {
        const fileStats = await stat(inProgressPath);
        if (fileStats.isFile()) {
          allocated.push({
            canonicalPath: absoluteFilePath,
            probePath: inProgressPath,
            fileStats,
          });
        }
      } catch {
        // not present either, move on.
      }
    }

    if (allocated.length === 0) {
      return null;
    }

    if (allocated.length === 1) {
      return allocated[0];
    }

    // Inspect first 16 bytes of each candidate; prefer ones whose header
    // matches a known container signature. Fall back to the largest file
    // when no candidate has a recognizable header yet.
    let best: Allocated | null = null;
    let bestScore = -1;
    for (const candidate of allocated) {
      const header = await this.readFileHeader(candidate.probePath, 16);
      const score = this.scoreMediaHeader(header, candidate.fileStats.size);
      this.logger.debug(
        `Torrent candidate ${candidate.probePath} size=${candidate.fileStats.size} header=${header ? header.subarray(0, 8).toString('hex') : '(unreadable)'} score=${score}`,
      );
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best ?? allocated[0];
  }

  private async readFileHeader(
    filePath: string,
    byteCount: number,
  ): Promise<Buffer | null> {
    return await readMediaFileHeader(filePath, byteCount);
  }

  /**
   * Emit a throttled diagnostic warning when the head-byte gate blocks the
   * probe. The next time we see "stuck waiting for first piece" we want a
   * single log line with everything needed to tell apart:
   *   - qBit hasn't actually downloaded piece 0 yet (seq/firstLast flags wrong
   *     or progress too low)
   *   - qBit has piece 0 but hasn't flushed it to the SMB share
   *   - the SMB client kept the pre-allocation zero-fill in its cache
   *   - we're reading a completely different file than we think
   */
  private async logHeadGateDiagnostic(input: {
    hash: string;
    probePath: string;
    headerBytes: Buffer | null;
    headerScore: number;
    fileSize: number;
  }): Promise<void> {
    const { hash, probePath, headerBytes, headerScore, fileSize } = input;
    const now = Date.now();
    const last = this.lastHeadGateLogAtMsByHash.get(hash) ?? 0;
    if (now - last < 10_000) {
      return;
    }
    this.lastHeadGateLogAtMsByHash.set(hash, now);

    const hex =
      headerBytes && headerBytes.length > 0
        ? headerBytes.toString('hex')
        : '(unreadable)';

    let qbInfo = 'qb=(unavailable)';
    try {
      const torrent = await this.torrentService.getTorrentByHash(hash);
      if (torrent) {
        qbInfo =
          `qb seq=${torrent.sequentialDownload} ` +
          `firstLast=${torrent.firstLastPiecePriority} ` +
          `progress=${(torrent.progress * 100).toFixed(2)}% ` +
          `state=${torrent.state} ` +
          `dlRate=${torrent.downloadRate}`;
      } else {
        qbInfo = 'qb=(torrent not found)';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      qbInfo = `qb=(error: ${message})`;
    }

    this.logger.warn(
      `Head-byte gate blocked hash=${hash} path=${probePath} ` +
        `bytes=${hex} score=${headerScore} statSize=${fileSize} ${qbInfo}`,
    );
  }

  private scoreMediaHeader(header: Buffer | null, fileSize: number): number {
    return scoreSharedMediaHeader(header, fileSize);
  }

  /**
   * Builds the set of directories we should walk when looking for an in-progress
   * torrent file. Includes the configured save path, content path, and their
   * immediate parents so that qBittorrent's "keep incomplete torrents in a
   * separate folder" setting is covered without needing extra API calls.
   */
  private collectTorrentSearchRoots(input: {
    savePath: string;
    contentPath: string | null;
  }): string[] {
    const roots = new Set<string>();

    const add = (candidate: string | null) => {
      if (!candidate) return;
      const resolved = resolve(candidate);
      // Skip filesystem roots like "C:\" or "/" — walking these from the cap
      // will exhaust the entry budget without ever reaching the torrent file.
      // These typically appear when qBittorrent reports a container path that
      // hasn't been remapped via system settings (e.g. "/downloads3" on
      // Windows resolves to "C:\downloads3" and its dirname is "C:\").
      const parent = dirname(resolved);
      if (parent === resolved) return;
      roots.add(resolved);
    };

    add(input.savePath);
    add(dirname(resolve(input.savePath)));

    if (input.contentPath) {
      const resolvedContent = resolve(input.contentPath);
      add(resolvedContent);
      add(dirname(resolvedContent));
    }

    return [...roots];
  }

  /**
   * Depth-limited breadth-first walk that finds files whose name matches the
   * expected basename (with or without the qBittorrent .!qB in-progress
   * suffix). Keeps a hard cap on visited directories/files so a misconfigured
   * root never blocks the indexer. If multiple matches exist, we score and
   * pick the best candidate instead of returning the first directory hit.
   */
  private async discoverTorrentFileByWalk(
    searchRoots: string[],
    expectedBasename: string,
  ): Promise<{
    canonicalPath: string;
    probePath: string;
    fileStats: Stats;
  } | null> {
    const targetExact = expectedBasename.toLowerCase();
    const targetInProgress = `${targetExact}.!qb`;

    const maxDepth = 4;
    const maxEntries = 2000;
    const visited = new Set<string>();
    const matches: Array<{
      canonicalPath: string;
      probePath: string;
      fileStats: Stats;
    }> = [];
    const seenMatches = new Set<string>();

    interface Frame {
      directoryPath: string;
      depth: number;
    }

    const queue: Frame[] = searchRoots.map((directoryPath) => ({
      directoryPath,
      depth: 0,
    }));
    let entriesSeen = 0;

    while (queue.length > 0) {
      const frame = queue.shift();
      if (!frame) break;

      const directoryKey = frame.directoryPath.toLowerCase();
      if (visited.has(directoryKey)) continue;
      visited.add(directoryKey);

      let entries: Dirent[];
      try {
        entries = await readdir(frame.directoryPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (++entriesSeen > maxEntries) {
          this.logger.warn(
            `Torrent file walk hit entry cap (${maxEntries}); stopping search early.`,
          );
          return null;
        }

        const entryName = entry.name;
        const entryNameLower = entryName.toLowerCase();
        const absolutePath = resolve(frame.directoryPath, entryName);

        if (entry.isFile()) {
          let matched: {
            canonicalPath: string;
            probePath: string;
            fileStats: Stats;
          } | null = null;

          if (entryNameLower === targetExact) {
            try {
              const fileStats = await stat(absolutePath);
              if (fileStats.isFile()) {
                matched = {
                  canonicalPath: absolutePath,
                  probePath: absolutePath,
                  fileStats,
                };
              }
            } catch {
              // ignore and continue
            }
          } else if (entryNameLower === targetInProgress) {
            const canonical = absolutePath.slice(0, -'.!qB'.length);
            try {
              const fileStats = await stat(absolutePath);
              if (fileStats.isFile()) {
                matched = {
                  canonicalPath: canonical,
                  probePath: absolutePath,
                  fileStats,
                };
              }
            } catch {
              // ignore and continue
            }
          }

          if (matched) {
            const key = matched.probePath.toLowerCase();
            if (!seenMatches.has(key)) {
              seenMatches.add(key);
              matches.push(matched);
            }
          }
        } else if (entry.isDirectory() && frame.depth < maxDepth) {
          queue.push({ directoryPath: absolutePath, depth: frame.depth + 1 });
        }
      }
    }

    if (matches.length === 0) {
      return null;
    }

    if (matches.length === 1) {
      return matches[0];
    }

    let best = matches[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestMtimeMs = Number.NEGATIVE_INFINITY;

    for (const candidate of matches) {
      const header = await this.readFileHeader(candidate.probePath, 16);
      const score = this.scoreMediaHeader(header, candidate.fileStats.size);
      const mtimeMs = Number.isFinite(candidate.fileStats.mtimeMs)
        ? candidate.fileStats.mtimeMs
        : Number.NEGATIVE_INFINITY;

      if (
        score > bestScore ||
        (score === bestScore && mtimeMs > bestMtimeMs) ||
        (score === bestScore &&
          mtimeMs === bestMtimeMs &&
          candidate.fileStats.size > best.fileStats.size)
      ) {
        best = candidate;
        bestScore = score;
        bestMtimeMs = mtimeMs;
      }
    }

    this.logger.debug(
      `Fallback torrent walk found ${matches.length} matches for ${expectedBasename}; selected ${best.probePath} (score=${bestScore}).`,
    );

    return best;
  }

  private rankTorrentVideoCandidates(
    files: Array<{ name: string; size: number }>,
  ): Array<{ name: string; size: number }> {
    const ranked = files.map((file) => {
      const detection = detectFromFilenameAndPath(
        basename(file.name, extname(file.name)),
        file.name,
      );
      const hasEpisodeSignal =
        detection.seasonNumber !== null || detection.episodeNumber !== null;

      return {
        ...file,
        isExtra: detection.suggestedType === 'other',
        hasEpisodeSignal,
        seasonNumber:
          detection.seasonNumber ??
          (hasEpisodeSignal ? 1 : Number.MAX_SAFE_INTEGER),
        episodeNumber: detection.episodeNumber ?? Number.MAX_SAFE_INTEGER,
      };
    });

    ranked.sort((left, right) => {
      if (left.isExtra !== right.isExtra) {
        return left.isExtra ? 1 : -1;
      }

      if (left.hasEpisodeSignal !== right.hasEpisodeSignal) {
        return left.hasEpisodeSignal ? -1 : 1;
      }

      if (left.hasEpisodeSignal && right.hasEpisodeSignal) {
        if (left.seasonNumber !== right.seasonNumber) {
          return left.seasonNumber - right.seasonNumber;
        }
        if (left.episodeNumber !== right.episodeNumber) {
          return left.episodeNumber - right.episodeNumber;
        }
      } else if (left.size !== right.size) {
        return right.size - left.size;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    return ranked.map((entry) => ({ name: entry.name, size: entry.size }));
  }

  private mergeTorrentFileHints(
    qbFiles: Array<{ name: string; size: number }>,
    hintedFiles: TorrentFileHint[],
  ): Array<{ name: string; size: number }> {
    const merged = new Map<string, { name: string; size: number }>();

    const addEntry = (name: string, size: number) => {
      const normalizedName = name.trim().replace(/\\/g, '/');
      if (!normalizedName) {
        return;
      }

      const key = normalizedName.toLowerCase();
      const safeSize = Number.isFinite(size)
        ? Math.max(0, Math.floor(size))
        : 0;
      const existing = merged.get(key);
      if (!existing || safeSize > existing.size) {
        merged.set(key, {
          name: normalizedName,
          size: safeSize,
        });
      }
    };

    for (const file of qbFiles) {
      addEntry(file.name, file.size);
    }

    for (const file of hintedFiles) {
      addEntry(file.name, file.size);
    }

    return [...merged.values()];
  }

  private async resolveLibraryRootForFile(
    absoluteFilePath: string,
    fallbackRoot: string,
  ): Promise<string> {
    const configured = await this.mediaLocationsStore.all();
    const normalizedFile = resolve(absoluteFilePath);

    for (const rawLocation of configured) {
      const resolved = resolve(rawLocation);
      const rel = relative(resolved, normalizedFile);
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        return resolved;
      }
    }

    return resolve(fallbackRoot);
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
    const cappedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(1000, Math.floor(limit ?? 0)))
      : 300;

    const basePaths = await this.resolveRecycleDeletionBases();
    const entries = await this.collectRecycleDeletionEntries(basePaths);
    entries.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );

    const totalSizeBytes = entries.reduce(
      (sum, entry) => sum + entry.sizeBytes,
      0,
    );
    const visibleEntries = entries.slice(0, cappedLimit);

    return {
      rootsScanned: basePaths,
      totalEntries: entries.length,
      totalSizeBytes,
      truncated: entries.length > visibleEntries.length,
      entries: visibleEntries,
    };
  }

  async purgeRecycleDeletions(input: {
    operationPaths?: string[];
    purgeAll?: boolean;
    olderThanDays?: number;
  }): Promise<PurgeRecycleDeletionsResult> {
    const basePaths = await this.resolveRecycleDeletionBases();
    const purgeAll = input.purgeAll === true;
    const olderThanDays =
      typeof input.olderThanDays === 'number' &&
      Number.isFinite(input.olderThanDays)
        ? Math.floor(input.olderThanDays)
        : null;

    if (olderThanDays !== null && olderThanDays <= 0) {
      throw new BadRequestException('olderThanDays must be greater than zero.');
    }

    let targetPaths: string[] = [];

    if (purgeAll || olderThanDays !== null) {
      const entries = await this.collectRecycleDeletionEntries(basePaths);

      if (olderThanDays !== null) {
        const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
        targetPaths = entries
          .filter((entry) => Date.parse(entry.updatedAt) <= cutoffMs)
          .map((entry) => entry.folderPath);
      } else {
        targetPaths = entries.map((entry) => entry.folderPath);
      }
    } else {
      targetPaths = this.normalizeRecycleOperationPaths(input.operationPaths);
      if (targetPaths.length === 0) {
        throw new BadRequestException(
          'Provide operationPaths, olderThanDays, or purgeAll.',
        );
      }
    }

    const dedupedTargetPaths = this.normalizeRecycleOperationPaths(targetPaths);
    const results: PurgeRecycleDeletionsResultItem[] = [];
    let deleted = 0;
    let failed = 0;
    let reclaimedBytes = 0;

    for (const folderPath of dedupedTargetPaths) {
      const resolvedPath = resolve(folderPath);

      if (!this.isValidRecycleOperationPath(resolvedPath, basePaths)) {
        failed += 1;
        results.push({
          folderPath: resolvedPath,
          success: false,
          reclaimedBytes: 0,
          error:
            'Path is not a valid recycle operation directory under configured media roots.',
        });
        continue;
      }

      if (!(await this.mediaFsFileOpsService.pathExists(resolvedPath))) {
        results.push({
          folderPath: resolvedPath,
          success: true,
          reclaimedBytes: 0,
        });
        continue;
      }

      try {
        const directoryStats = await stat(resolvedPath);
        if (!directoryStats.isDirectory()) {
          throw new Error('Target path is not a directory.');
        }

        const summary = await this.summarizeRecycleOperation(resolvedPath);

        await rm(resolvedPath, { recursive: true, force: false });
        deleted += 1;
        reclaimedBytes += summary.sizeBytes;

        results.push({
          folderPath: resolvedPath,
          success: true,
          reclaimedBytes: summary.sizeBytes,
        });

        const recycleCategoryPath = dirname(resolvedPath);
        const recycleRootPath = dirname(recycleCategoryPath);
        await this.removeDirectoryIfEmpty(recycleCategoryPath);
        await this.removeDirectoryIfEmpty(recycleRootPath);
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          folderPath: resolvedPath,
          success: false,
          reclaimedBytes: 0,
          error: message,
        });
      }
    }

    const requested = dedupedTargetPaths.length;
    const message =
      failed === 0
        ? `Purged ${deleted} recycle operation folder(s), reclaimed ${reclaimedBytes} bytes.`
        : `Purged ${deleted} of ${requested} recycle operation folder(s), reclaimed ${reclaimedBytes} bytes; ${failed} failed.`;

    return {
      requested,
      deleted,
      failed,
      reclaimedBytes,
      results,
      message,
    };
  }

  async exportMetadata(): Promise<MediaMetadataExportPayload> {
    const items = await this.mediaStore.all();
    const pathContext = await this.createImportPathContext();
    const imageAssets: Record<string, MetadataExportImageAsset> = {};
    const portableItems = await Promise.all(
      items.map((item) =>
        this.toPortableExportItem(item, pathContext, imageAssets),
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
    const pathContext = await this.createImportPathContext();

    if (sourceItems.length > 0 && pathContext.roots.length === 0) {
      throw new BadRequestException(
        'Import requires at least one saved media location. Configure media locations first, then retry the import.',
      );
    }

    const restoredAssetPathById = new Map<string, string>();
    const unresolvedPaths: string[] = [];
    const normalizedItems = sourceItems.map((entry, index) =>
      this.normalizeImportedMediaItem(entry, index, importedAt, pathContext),
    );
    const items: MediaItem[] = [];

    for (const item of normalizedItems) {
      let nextItem = item;

      try {
        const resolved = await this.resolveImportedFilePathWithinLocations(
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

      const hydratedItem = await this.restorePortableImagePaths(
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
      items: this.extractImportedItems(parsed),
      imageAssets: this.extractImportedImageAssets(parsed),
    });
  }

  async updateMedia(
    mediaId: string,
    patch: MediaMetadataPatch,
  ): Promise<MediaItem> {
    const existing = await this.getById(mediaId);
    const { effectivePatch, remoteSelectionChanged, remoteCandidate } =
      await this.enrichPatchFromRemoteSelection(existing, patch);
    await this.enrichPatchFromEpisodeCatalogSelection(
      existing,
      patch,
      effectivePatch,
      remoteSelectionChanged,
      remoteCandidate,
    );
    const updated = this.applyPatch(existing, effectivePatch);
    this.reconcileEpisodeCatalogLink(updated, existing, remoteCandidate, true);

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

      const rebuiltArtwork = await this.rebuildArtworkForMetadataUpdate({
        item: updated,
        preferredPosterUrl,
        preferredBackdropUrl,
        forceDownload: true,
        allowExistingFallback: !remoteSelectionChanged,
      });

      updated.previewImagePath = rebuiltArtwork.previewImagePath;
      updated.backdropImagePath = rebuiltArtwork.backdropImagePath;
      updated.chapterThumbnails = rebuiltArtwork.chapterThumbnails;
    }

    await this.mediaStore.upsert(updated);
    return updated;
  }

  private async enrichPatchFromRemoteSelection(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): Promise<EnrichedMetadataPatchResult> {
    const touchesRemoteSelection =
      this.hasPatchKey(patch, 'remoteSource') ||
      this.hasPatchKey(patch, 'remoteSourceId');

    const effectivePatch: MediaMetadataPatch = { ...patch };

    if (!touchesRemoteSelection) {
      return {
        effectivePatch,
        remoteSelectionChanged: false,
        remoteCandidate: null,
      };
    }

    const previousSelection = this.resolveRemoteSelectionFromItem(existing);
    const nextSelection = this.resolveRemoteSelectionAfterPatch(
      existing,
      patch,
    );
    const remoteSelectionChanged = !this.remoteSelectionsEqual(
      previousSelection,
      nextSelection,
    );

    if (!nextSelection) {
      return {
        effectivePatch,
        remoteSelectionChanged,
        remoteCandidate: null,
      };
    }

    const mediaTypeHint = this.resolveMediaTypeHintAfterPatch(existing, patch);
    const remoteCandidate = await this.fetchRemoteCandidate(
      nextSelection.provider,
      nextSelection.providerId,
      mediaTypeHint,
    );

    if (!remoteCandidate) {
      return {
        effectivePatch,
        remoteSelectionChanged,
        remoteCandidate: null,
      };
    }

    if (
      !this.hasPatchKey(effectivePatch, 'posterUrl') &&
      this.hasNonEmptyString(remoteCandidate.posterUrl)
    ) {
      effectivePatch.posterUrl = remoteCandidate.posterUrl;
    }

    if (
      !this.hasPatchKey(effectivePatch, 'backdropUrl') &&
      this.hasNonEmptyString(remoteCandidate.backdropUrl)
    ) {
      effectivePatch.backdropUrl = remoteCandidate.backdropUrl;
    }

    if (
      remoteSelectionChanged &&
      !this.hasPatchKey(effectivePatch, 'releaseYear') &&
      typeof remoteCandidate.releaseYear === 'number' &&
      Number.isFinite(remoteCandidate.releaseYear)
    ) {
      effectivePatch.releaseYear = Math.floor(remoteCandidate.releaseYear);
    }

    if (
      remoteSelectionChanged &&
      this.shouldHydrateDescriptionFromRemote(existing, patch) &&
      this.hasNonEmptyString(remoteCandidate.overview)
    ) {
      effectivePatch.description = remoteCandidate.overview;
    }

    return {
      effectivePatch,
      remoteSelectionChanged,
      remoteCandidate,
    };
  }

  private async enrichPatchFromEpisodeCatalogSelection(
    existing: MediaItem,
    originalPatch: MediaMetadataPatch,
    effectivePatch: MediaMetadataPatch,
    remoteSelectionChanged: boolean,
    remoteCandidate: RemoteMediaCandidate | null,
  ): Promise<void> {
    const nextType = this.resolveMediaTypeHintAfterPatch(
      existing,
      effectivePatch,
    );
    if (nextType !== 'show') {
      return;
    }

    const nextSelection = this.resolveRemoteSelectionAfterPatch(
      existing,
      effectivePatch,
    );
    if (
      !nextSelection ||
      (nextSelection.provider !== 'jikan' && nextSelection.provider !== 'tmdb')
    ) {
      return;
    }

    const seasonNumber = this.hasPatchKey(effectivePatch, 'seasonNumber')
      ? (effectivePatch.seasonNumber ?? null)
      : existing.seasonNumber;
    if (
      typeof seasonNumber === 'number' &&
      Number.isFinite(seasonNumber) &&
      Math.floor(seasonNumber) < 0
    ) {
      return;
    }

    const normalizedSeasonNumber =
      typeof seasonNumber === 'number' && Number.isFinite(seasonNumber)
        ? Math.floor(seasonNumber)
        : 1;

    const episodeNumber = this.hasPatchKey(effectivePatch, 'episodeNumber')
      ? this.coercePositiveEpisodeNumber(effectivePatch.episodeNumber ?? null)
      : this.coercePositiveEpisodeNumber(existing.episodeNumber);
    if (!episodeNumber) {
      return;
    }

    const catalog = await this.loadSeriesEpisodeCatalog({
      source: nextSelection.provider,
      providerId: nextSelection.providerId,
    });
    if (!catalog || catalog.episodes.length === 0) {
      return;
    }

    const episodeDetails =
      catalog.source === 'jikan'
        ? catalog.episodes.find(
            (episode) => episode.episodeNumber === episodeNumber,
          )
        : normalizedSeasonNumber < 1
          ? null
          : catalog.episodes.find(
              (episode) =>
                episode.seasonNumber === normalizedSeasonNumber &&
                episode.episodeNumber === episodeNumber,
            );
    if (!episodeDetails) {
      return;
    }

    const incomingEpisodeTitle = this.normalizeOptionalString(
      this.hasPatchKey(originalPatch, 'episodeTitle')
        ? (originalPatch.episodeTitle ?? null)
        : null,
    );

    const shouldReplaceEpisodeTitle =
      remoteSelectionChanged ||
      this.hasPatchKey(originalPatch, 'episodeNumber') ||
      this.hasPatchKey(originalPatch, 'seasonNumber') ||
      !this.hasPatchKey(originalPatch, 'episodeTitle') ||
      !incomingEpisodeTitle;

    if (shouldReplaceEpisodeTitle) {
      effectivePatch.episodeTitle = episodeDetails.title;
    }

    const episodeSynopsis = this.normalizeOptionalString(
      episodeDetails.synopsis,
    );
    if (!episodeSynopsis) {
      return;
    }

    const incomingDescription = this.normalizeOptionalString(
      this.hasPatchKey(originalPatch, 'description')
        ? (originalPatch.description ?? null)
        : null,
    );
    const remoteOverview = this.normalizeOptionalString(
      remoteCandidate?.overview ?? null,
    );

    const shouldReplaceDescription =
      remoteSelectionChanged ||
      this.hasPatchKey(originalPatch, 'episodeNumber') ||
      this.hasPatchKey(originalPatch, 'seasonNumber') ||
      !this.hasPatchKey(originalPatch, 'description') ||
      !incomingDescription ||
      this.shouldHydrateDescriptionFromRemote(existing, originalPatch) ||
      (!!remoteOverview && incomingDescription === remoteOverview);

    if (shouldReplaceDescription) {
      effectivePatch.description = episodeSynopsis;
    }
  }

  private resolveRemoteSelectionFromItem(
    item: MediaItem,
  ): RemoteSelectionRef | null {
    const remoteSourceId = this.normalizeOptionalString(item.remoteSourceId);

    if (
      (item.remoteSource !== 'tmdb' && item.remoteSource !== 'jikan') ||
      !remoteSourceId
    ) {
      return null;
    }

    return {
      provider: item.remoteSource,
      providerId: remoteSourceId,
    };
  }

  private resolveRemoteSelectionAfterPatch(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): RemoteSelectionRef | null {
    const nextSource = this.hasPatchKey(patch, 'remoteSource')
      ? (patch.remoteSource ?? null)
      : (existing.remoteSource ?? null);
    const nextId = this.hasPatchKey(patch, 'remoteSourceId')
      ? this.normalizeOptionalString(patch.remoteSourceId)
      : this.normalizeOptionalString(existing.remoteSourceId);

    if ((nextSource !== 'tmdb' && nextSource !== 'jikan') || !nextId) {
      return null;
    }

    return {
      provider: nextSource,
      providerId: nextId,
    };
  }

  private remoteSelectionsEqual(
    left: RemoteSelectionRef | null,
    right: RemoteSelectionRef | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return (
      left.provider === right.provider && left.providerId === right.providerId
    );
  }

  private resolveMediaTypeHintAfterPatch(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): 'movie' | 'show' | null {
    const patchedType = this.hasPatchKey(patch, 'type')
      ? patch.type
      : existing.type;

    if (patchedType === 'movie' || patchedType === 'show') {
      return patchedType;
    }

    return existing.type === 'movie' || existing.type === 'show'
      ? existing.type
      : null;
  }

  private shouldHydrateDescriptionFromRemote(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): boolean {
    if (!this.hasPatchKey(patch, 'description')) {
      return true;
    }

    if (typeof patch.description !== 'string') {
      return false;
    }

    const incomingDescription = patch.description.trim();
    if (!incomingDescription) {
      return true;
    }

    const existingDescription =
      this.normalizeOptionalString(existing.description) ?? '';
    return incomingDescription === existingDescription;
  }

  private async fetchRemoteCandidate(
    provider: RemoteMediaProvider,
    providerId: string,
    mediaTypeHint: 'movie' | 'show' | null,
  ): Promise<RemoteMediaCandidate | null> {
    try {
      if (provider === 'tmdb') {
        if (mediaTypeHint) {
          return await this.tmdbMetadataService.getRemoteDetails({
            providerId,
            mediaType: mediaTypeHint,
          });
        }

        const movieCandidate = await this.tmdbMetadataService.getRemoteDetails({
          providerId,
          mediaType: 'movie',
        });
        if (movieCandidate) {
          return movieCandidate;
        }

        return await this.tmdbMetadataService.getRemoteDetails({
          providerId,
          mediaType: 'show',
        });
      }

      const candidate =
        await this.jikanMetadataService.getRemoteDetails(providerId);
      if (!candidate) {
        return null;
      }

      if (mediaTypeHint && candidate.mediaType !== mediaTypeHint) {
        return {
          ...candidate,
          mediaType: mediaTypeHint,
        };
      }

      return candidate;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Remote metadata hydration failed for ${provider}:${providerId}: ${message}`,
      );
      return null;
    }
  }

  private async rebuildArtworkForMetadataUpdate(input: {
    item: MediaItem;
    preferredPosterUrl: string | null;
    preferredBackdropUrl: string | null;
    forceDownload: boolean;
    allowExistingFallback: boolean;
  }): Promise<RebuiltArtworkResult> {
    const existingPreview = input.allowExistingFallback
      ? this.normalizeOptionalString(input.item.previewImagePath)
      : null;
    const existingBackdrop = input.allowExistingFallback
      ? this.normalizeOptionalString(input.item.backdropImagePath)
      : null;
    const existingChapters = input.allowExistingFallback
      ? input.item.chapterThumbnails
      : [];

    let resolvedFilePath = input.item.filePath;
    try {
      resolvedFilePath = await this.resolveMediaFilePath(
        input.item.filePath,
        input.item.relativePath,
      );
    } catch {
      // Fall back to the stored path if the importer path resolver cannot map it.
    }

    const sidecarPreviewImagePath = await this.mediaPreviewResolver
      .findPreviewImagePath(resolvedFilePath)
      .catch(() => null);

    let chapterThumbnails: MediaItem['chapterThumbnails'] = [];
    try {
      const fileStats = await stat(resolvedFilePath);
      if (fileStats.isFile()) {
        const settings = await this.systemSettingsService.getSettings();
        chapterThumbnails =
          await this.mediaPreviewResolver.generateChapterThumbnails(
            resolvedFilePath,
            Math.max(0, input.item.durationSeconds),
            fileStats.mtimeMs,
            settings.ffmpegPath,
            settings.thumbnailCaptureCount,
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Chapter thumbnail refresh skipped for ${input.item.filePath}: ${message}`,
      );
    }

    const posterSourceUrl = this.normalizeOptionalString(
      input.preferredPosterUrl,
    );
    const backdropSourceUrl = this.normalizeOptionalString(
      input.preferredBackdropUrl,
    );

    const [downloadedPosterImagePath, downloadedBackdropImagePath] =
      await Promise.all([
        posterSourceUrl
          ? this.mediaPreviewResolver.downloadPosterThumbnail(
              posterSourceUrl,
              resolvedFilePath,
              input.forceDownload,
            )
          : Promise.resolve<string | null>(null),
        backdropSourceUrl
          ? this.mediaPreviewResolver.downloadBackdropThumbnail(
              backdropSourceUrl,
              resolvedFilePath,
              input.forceDownload,
            )
          : Promise.resolve<string | null>(null),
      ]);

    const metadataPosterImagePath =
      downloadedPosterImagePath || posterSourceUrl;
    const metadataBackdropImagePath =
      downloadedBackdropImagePath || backdropSourceUrl;

    const previewImagePath =
      this.mediaPreviewResolver.selectBestPreviewImagePath(
        sidecarPreviewImagePath,
        metadataPosterImagePath,
        chapterThumbnails,
      );
    const backdropImagePath =
      this.mediaPreviewResolver.selectBestBackdropImagePath(
        metadataBackdropImagePath,
        chapterThumbnails,
        sidecarPreviewImagePath,
      );

    return {
      previewImagePath: previewImagePath ?? existingPreview,
      backdropImagePath: backdropImagePath ?? existingBackdrop,
      chapterThumbnails:
        chapterThumbnails.length > 0 ? chapterThumbnails : existingChapters,
    };
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
    const normalizeExactTitle = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const requestedLimit = Math.max(1, Math.min(input.limit ?? 8, 20));
    const providerLimit = Math.max(6, Math.min(requestedLimit * 2, 24));
    const includeJikan = input.type === 'show' || input.type === 'other';

    const [tmdbCandidates, jikanCandidates] = await Promise.all([
      this.tmdbMetadataService.searchCandidates({
        title: input.title,
        mediaType: input.type,
        releaseYear: input.year,
        limit: providerLimit,
      }),
      includeJikan
        ? this.jikanMetadataService.searchCandidates({
            title: input.title,
            limit: providerLimit,
            useCache: true,
          })
        : Promise.resolve<JikanRemoteCandidate[]>([]),
    ]);

    const mappedJikanCandidates = jikanCandidates
      .filter((candidate) =>
        input.type === 'other' ? true : candidate.mediaType === input.type,
      )
      .map((candidate) => ({
        title: candidate.title,
        mediaType: candidate.mediaType,
        tags: candidate.tags,
        overview: candidate.overview,
        releaseYear: candidate.releaseYear,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        remoteSource: 'jikan' as const,
        remoteSourceId: candidate.providerId,
      }));

    const topJikanCandidate = mappedJikanCandidates[0] ?? null;
    const inputTitleKey = normalizeExactTitle(input.title);
    const topJikanIsPerfectMatch =
      topJikanCandidate !== null &&
      inputTitleKey.length > 0 &&
      normalizeExactTitle(topJikanCandidate.title) === inputTitleKey;
    const curatedJikanCandidates =
      topJikanIsPerfectMatch && topJikanCandidate ? [topJikanCandidate] : [];

    const orderedCandidates = [...curatedJikanCandidates, ...tmdbCandidates];

    const seen = new Set<string>();
    const candidates: Array<{
      title: string;
      mediaType: 'movie' | 'show' | 'other';
      tags: string[];
      overview: string | null;
      releaseYear: number | null;
      posterUrl: string | null;
      backdropUrl: string | null;
      remoteSource: 'tmdb' | 'jikan';
      remoteSourceId: string;
    }> = [];

    for (const candidate of orderedCandidates) {
      const key = `${candidate.remoteSource}:${candidate.remoteSourceId}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push(candidate);

      if (candidates.length >= requestedLimit) {
        break;
      }
    }

    return { candidates };
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
    const cleanedQuery = input.query.trim();
    const useCache = input.useCache !== false;
    const providers = this.normalizeRemoteProviders(input.providers);
    const requestedTags = this.normalizeTagFilters(input.tags);
    const requestLimit = Math.max(1, Math.min(input.limit ?? 24, 72));
    const requestPage = Math.max(1, Math.floor(input.page ?? 1));
    const resultOffset = (requestPage - 1) * requestLimit;
    const isTagExploreMode =
      cleanedQuery.length === 0 && requestedTags.length > 0;
    const searchProbes = this.buildRemoteSearchProbes(
      cleanedQuery,
      requestedTags,
    );

    if (searchProbes.length === 0) {
      return {
        query: cleanedQuery,
        providers,
        total: 0,
        page: requestPage,
        hasMore: false,
        items: [],
      };
    }

    const localItems = await this.mediaStore.all();
    const localTitleIndex = this.buildLocalTitleIndex(localItems);
    const requiredItemCount = resultOffset + requestLimit;
    const providerLimit =
      requestedTags.length > 0
        ? isTagExploreMode
          ? requestLimit
          : Math.min(480, Math.max(requiredItemCount * 2, 48))
        : Math.min(320, Math.max(requiredItemCount, 28));
    const browseTags = requestedTags.slice(0, 3);
    const shouldRunProbeSearch = !isTagExploreMode;

    const [
      tmdbCandidates,
      jikanCandidates,
      tmdbTagCandidates,
      jikanTagCandidates,
    ] = await Promise.all([
      providers.includes('tmdb') && shouldRunProbeSearch
        ? this.collectTmdbRemoteCandidates(
            searchProbes,
            providerLimit,
            useCache,
          )
        : Promise.resolve<TmdbRemoteCandidate[]>([]),
      providers.includes('jikan') && shouldRunProbeSearch
        ? this.collectJikanRemoteCandidates(
            searchProbes,
            providerLimit,
            useCache,
          )
        : Promise.resolve<JikanRemoteCandidate[]>([]),
      providers.includes('tmdb') && browseTags.length > 0
        ? this.collectTmdbRemoteTagCandidates(
            browseTags,
            providerLimit,
            useCache,
            requestPage,
          )
        : Promise.resolve<TmdbRemoteCandidate[]>([]),
      providers.includes('jikan') && browseTags.length > 0
        ? this.collectJikanRemoteTagCandidates(
            browseTags,
            providerLimit,
            useCache,
            requestPage,
          )
        : Promise.resolve<JikanRemoteCandidate[]>([]),
    ]);

    const combined = [
      ...tmdbCandidates,
      ...jikanCandidates,
      ...tmdbTagCandidates,
      ...jikanTagCandidates,
    ];
    const deduped = new Map<string, RemoteMediaCandidate>();

    for (const candidate of combined) {
      if (!this.hasUsefulRemoteCandidate(candidate)) {
        continue;
      }

      if (!this.matchesRemoteTagFilters(candidate, requestedTags)) {
        continue;
      }

      if (
        !isTagExploreMode &&
        this.isAlreadyIndexedLocally(candidate, localTitleIndex)
      ) {
        continue;
      }

      const key = this.remoteCandidateDedupeKey(candidate);
      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, candidate);
        continue;
      }

      if (
        this.remoteCandidateScore(candidate) >
        this.remoteCandidateScore(existing)
      ) {
        deduped.set(key, candidate);
      }
    }

    const sortedCandidates = [...deduped.values()].sort((left, right) => {
      const scoreDelta =
        this.remoteCandidateScore(right) - this.remoteCandidateScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.title.localeCompare(right.title, undefined, {
        sensitivity: 'base',
      });
    });

    const sliceOffset = isTagExploreMode ? 0 : resultOffset;
    const pagedCandidates = sortedCandidates.slice(
      sliceOffset,
      sliceOffset + requestLimit,
    );
    const items = pagedCandidates.map((candidate) =>
      this.toRemoteMediaItem(candidate),
    );
    const hasMore = isTagExploreMode
      ? items.length > 0
      : sortedCandidates.length > resultOffset + requestLimit;

    return {
      query: cleanedQuery,
      providers,
      total: sortedCandidates.length,
      page: requestPage,
      hasMore,
      items,
    };
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    const parsed = this.parseRemoteMediaId(remoteId);
    if (!parsed) {
      throw new NotFoundException('Remote media item not found.');
    }

    let candidate: RemoteMediaCandidate | null = null;

    if (parsed.provider === 'tmdb') {
      candidate = await this.tmdbMetadataService.getRemoteDetails({
        providerId: parsed.providerId,
        mediaType: parsed.mediaType,
      });
    } else {
      candidate = await this.jikanMetadataService.getRemoteDetails(
        parsed.providerId,
      );

      if (candidate && candidate.mediaType !== parsed.mediaType) {
        candidate = {
          ...candidate,
          mediaType: parsed.mediaType,
        };
      }
    }

    if (!candidate) {
      throw new NotFoundException('Remote media item not found.');
    }

    return this.toRemoteMediaItem(candidate);
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
    const seriesAssignmentRules = this.normalizeSeriesAssignmentRules(
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

    if (hasOwn('remoteSource')) {
      const value = patch.remoteSource;
      if (value === null || value === undefined) {
        next.remoteSource = undefined;
      } else if (value === 'tmdb' || value === 'jikan') {
        next.remoteSource = value;
      } else {
        throw new BadRequestException('Invalid remote metadata source.');
      }
    }

    if (hasOwn('remoteSourceId')) {
      const value = patch.remoteSourceId;
      if (value === null || value === undefined) {
        next.remoteSourceId = null;
      } else {
        const cleaned = value.trim();
        next.remoteSourceId = cleaned ? cleaned : null;
      }
    }

    if (!next.remoteSource || !next.remoteSourceId) {
      next.remoteSource = undefined;
      next.remoteSourceId = null;
      next.remoteSourceLabel = null;
    } else {
      next.remoteSourceLabel = this.remoteSourceLabel(next.remoteSource);
    }

    if (hasOwn('seriesAssignmentRules')) {
      next.seriesAssignmentRules = this.normalizeSeriesAssignmentRules(
        patch.seriesAssignmentRules,
      );
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

    this.reconcileEpisodeCatalogLink(next, existing, null, false);

    next.normalizedTitle = normalizeForKey(next.title);
    next.dedupeKey = this.buildDedupeKey(next);

    const previousTimestamp = Date.parse(
      existing.metadataRefreshedAt || existing.updatedAt,
    );
    let nextTimestamp = Date.now();
    if (
      Number.isFinite(previousTimestamp) &&
      nextTimestamp <= previousTimestamp
    ) {
      nextTimestamp = previousTimestamp + 1;
    }

    const now = new Date(nextTimestamp).toISOString();
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

  private normalizeSeriesAssignmentRules(
    rules: SeriesAssignmentRules | null | undefined,
  ): SeriesAssignmentRules | null {
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
      return null;
    }

    const keywordMappings = this.normalizeSeriesKeywordMappings(
      rules.keywordMappings,
    );
    const patternMappings = this.normalizeSeriesPatternMappings(
      rules.patternMappings,
    );

    if (keywordMappings.length === 0 && patternMappings.length === 0) {
      return null;
    }

    const normalized: SeriesAssignmentRules = {};
    if (keywordMappings.length > 0) {
      normalized.keywordMappings = keywordMappings;
    }
    if (patternMappings.length > 0) {
      normalized.patternMappings = patternMappings;
    }

    return normalized;
  }

  private normalizeSeriesKeywordMappings(
    value: SeriesAssignmentRules['keywordMappings'] | undefined,
  ): NonNullable<SeriesAssignmentRules['keywordMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized: NonNullable<SeriesAssignmentRules['keywordMappings']> =
      [];

    for (const rule of value) {
      if (!rule || typeof rule !== 'object') {
        continue;
      }

      const keyword =
        typeof rule.keyword === 'string' ? rule.keyword.trim() : '';
      if (!keyword) {
        continue;
      }

      const seasonNumber = this.coerceOptionalSeasonInt(rule.seasonNumber);
      const episodeNumber = this.coerceOptionalNonNegativeInt(
        rule.episodeNumber,
      );
      if (seasonNumber === null && episodeNumber === null) {
        continue;
      }

      normalized.push({
        keyword,
        seasonNumber,
        episodeNumber,
      });
    }

    return normalized;
  }

  private normalizeSeriesPatternMappings(
    value: SeriesAssignmentRules['patternMappings'] | undefined,
  ): NonNullable<SeriesAssignmentRules['patternMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized: NonNullable<SeriesAssignmentRules['patternMappings']> =
      [];

    for (const rule of value) {
      if (!rule || typeof rule !== 'object') {
        continue;
      }

      const pattern =
        typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
      if (!pattern) {
        continue;
      }

      const flags = this.sanitizeRegexFlags(rule.flags);
      try {
        RegExp(pattern, flags);
      } catch {
        continue;
      }

      const seasonGroup = this.coerceOptionalPositiveInt(rule.seasonGroup);
      const episodeGroup = this.coerceOptionalPositiveInt(rule.episodeGroup);
      const seasonNumber = this.coerceOptionalSeasonInt(rule.seasonNumber);
      const episodeNumber = this.coerceOptionalNonNegativeInt(
        rule.episodeNumber,
      );

      if (
        seasonGroup === null &&
        episodeGroup === null &&
        seasonNumber === null &&
        episodeNumber === null
      ) {
        continue;
      }

      normalized.push({
        pattern,
        flags: flags || undefined,
        seasonGroup,
        episodeGroup,
        seasonNumber,
        episodeNumber,
      });
    }

    return normalized;
  }

  private sanitizeRegexFlags(value: string | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const allowed = new Set(['i', 'm', 's', 'u']);
    const deduped = new Set<string>();

    for (const char of value.toLowerCase()) {
      if (allowed.has(char)) {
        deduped.add(char);
      }
    }

    return [...deduped].join('');
  }

  private coerceOptionalNonNegativeInt(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const floored = Math.floor(value);
    return floored >= 0 ? floored : null;
  }

  private coerceOptionalSeasonInt(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const floored = Math.floor(value);
    return floored >= -1 ? floored : null;
  }

  private coerceOptionalPositiveInt(
    value: number | null | undefined,
  ): number | null {
    const parsed = this.coerceOptionalNonNegativeInt(value);
    if (parsed === null || parsed < 1) {
      return null;
    }

    return parsed;
  }

  private normalizeImportedMediaItem(
    value: unknown,
    index: number,
    fallbackTimestamp: string,
    pathContext: MetadataImportPathContext,
  ): MediaItem {
    const context = `items[${index}]`;

    if (!this.isObjectRecord(value)) {
      throw new BadRequestException(`Invalid metadata object at ${context}.`);
    }

    const title = this.readRequiredString(value, 'title', context);
    const importedFilePath = this.readRequiredString(
      value,
      'filePath',
      context,
    );
    const importedRelativePath = this.readRequiredString(
      value,
      'relativePath',
      context,
    );
    const relativePath =
      this.normalizeImportedRelativePath(importedRelativePath);
    const filePath = this.rebaseImportedFilePath(
      importedFilePath,
      relativePath,
      pathContext,
    );
    const id = this.readOptionalString(value, 'id') ?? randomUUID();
    const type = this.normalizeImportedType(
      this.readOptionalString(value, 'type'),
    );
    const normalizedTitle =
      this.readOptionalString(value, 'normalizedTitle') ??
      normalizeForKey(title);
    const tags = this.normalizeEditableTags(
      this.readStringArray(value, 'tags'),
    );
    const releaseYear = this.coerceOptionalInt(
      this.readOptionalNumber(value, 'releaseYear'),
    );
    let seasonNumber = this.coerceOptionalInt(
      this.readOptionalNumber(value, 'seasonNumber'),
    );
    let episodeNumber = this.coerceOptionalInt(
      this.readOptionalNumber(value, 'episodeNumber'),
    );
    let episodeTitle = this.readOptionalString(value, 'episodeTitle');

    if (type === 'show' && seasonNumber === null) {
      seasonNumber = 1;
    }

    if (type !== 'show') {
      seasonNumber = null;
      episodeNumber = null;
      episodeTitle = null;
    }

    const extension =
      this.readOptionalString(value, 'extension') ||
      extname(filePath) ||
      '.bin';
    const metadataRefreshedAt = this.normalizeImportedTimestamp(
      this.readOptionalString(value, 'metadataRefreshedAt'),
      fallbackTimestamp,
    );
    const updatedAt = this.normalizeImportedTimestamp(
      this.readOptionalString(value, 'updatedAt'),
      metadataRefreshedAt,
    );
    const remoteSource = this.normalizeRemoteSource(
      this.readOptionalString(value, 'remoteSource'),
    );
    const remoteSourceId = this.readOptionalString(value, 'remoteSourceId');
    const episodeCatalogSource = this.normalizeEpisodeCatalogSource(
      this.readOptionalString(value, 'episodeCatalogSource'),
    );
    const episodeCatalogSourceId = this.readOptionalString(
      value,
      'episodeCatalogSourceId',
    );

    const item: MediaItem = {
      id,
      title,
      normalizedTitle,
      tags,
      description: this.readOptionalString(value, 'description'),
      releaseYear,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      dedupeKey: '',
      relativePath,
      filePath,
      extension,
      container: this.readOptionalString(value, 'container'),
      type,
      digitalMediaType: this.normalizeDigitalMediaType(
        this.readOptionalString(value, 'digitalMediaType'),
      ),
      sizeBytes: this.toNonNegativeInteger(
        this.readOptionalNumber(value, 'sizeBytes'),
      ),
      durationSeconds: this.toNonNegativeNumber(
        this.readOptionalNumber(value, 'durationSeconds'),
      ),
      width: this.toNonNegativeNullableInteger(
        this.readOptionalNumber(value, 'width'),
      ),
      height: this.toNonNegativeNullableInteger(
        this.readOptionalNumber(value, 'height'),
      ),
      videoCodec: this.readOptionalString(value, 'videoCodec'),
      audioCodec: this.readOptionalString(value, 'audioCodec'),
      subtitleStreams: this.toNonNegativeInteger(
        this.readOptionalNumber(value, 'subtitleStreams'),
      ),
      subtitleDetails: this.normalizeImportedSubtitleDetails(
        value['subtitleDetails'],
      ),
      previewImagePath: this.readOptionalString(value, 'previewImagePath'),
      backdropImagePath: this.readOptionalString(value, 'backdropImagePath'),
      chapterThumbnails: this.normalizeImportedChapterThumbnails(
        value['chapterThumbnails'],
      ),
      mediaDetails: this.normalizeImportedMediaDetails(value['mediaDetails']),
      metadataRefreshedAt,
      updatedAt,
      remoteSource,
      remoteSourceId: remoteSource ? remoteSourceId : null,
      remoteSourceLabel: remoteSource
        ? this.remoteSourceLabel(remoteSource)
        : null,
      episodeCatalogSource,
      episodeCatalogSourceId: episodeCatalogSource
        ? episodeCatalogSourceId
        : null,
      seriesAssignmentRules: this.normalizeSeriesAssignmentRules(
        value['seriesAssignmentRules'] as
          | SeriesAssignmentRules
          | null
          | undefined,
      ),
    };

    this.reconcileEpisodeCatalogLink(item, null, null, false);

    const importedDedupeKey = this.readOptionalString(value, 'dedupeKey');
    item.dedupeKey = importedDedupeKey || this.buildDedupeKey(item);

    return item;
  }

  private normalizeImportedType(
    value: string | null,
  ): 'movie' | 'show' | 'other' {
    if (value === 'movie' || value === 'show' || value === 'other') {
      return value;
    }

    return 'other';
  }

  private normalizeDigitalMediaType(
    value: string | null,
  ): 'video' | 'audio' | 'image' | 'other' {
    if (
      value === 'video' ||
      value === 'audio' ||
      value === 'image' ||
      value === 'other'
    ) {
      return value;
    }

    return 'other';
  }

  private normalizeRemoteSource(
    value: string | null,
  ): 'tmdb' | 'jikan' | undefined {
    if (value === 'tmdb' || value === 'jikan') {
      return value;
    }

    return undefined;
  }

  private normalizeEpisodeCatalogSource(
    value: string | null,
  ): 'tmdb' | 'jikan' | null {
    return value === 'tmdb' || value === 'jikan' ? value : null;
  }

  private reconcileEpisodeCatalogLink(
    target: MediaItem,
    previous: MediaItem | null,
    remoteCandidate: RemoteMediaCandidate | null,
    warmCatalog: boolean,
  ): void {
    if (target.type !== 'show') {
      target.episodeCatalogSource = null;
      target.episodeCatalogSourceId = null;
      return;
    }

    let linkedCatalog = this.resolveEpisodeCatalogLink(target);

    if (
      (remoteCandidate?.provider === 'jikan' ||
        remoteCandidate?.provider === 'tmdb') &&
      remoteCandidate.mediaType === 'show'
    ) {
      linkedCatalog = {
        source: remoteCandidate.provider,
        providerId: remoteCandidate.providerId,
      };
    } else if (
      target.remoteSource === 'jikan' ||
      target.remoteSource === 'tmdb'
    ) {
      const linkedProviderId = this.normalizeOptionalString(
        target.remoteSourceId,
      );
      linkedCatalog = linkedProviderId
        ? {
            source: target.remoteSource,
            providerId: linkedProviderId,
          }
        : null;
    } else if (target.remoteSource) {
      linkedCatalog = null;
    } else if (!linkedCatalog && previous) {
      linkedCatalog = this.resolveEpisodeCatalogLink(previous);
    }

    if (linkedCatalog) {
      target.episodeCatalogSource = linkedCatalog.source;
      target.episodeCatalogSourceId = linkedCatalog.providerId;

      if (warmCatalog) {
        this.warmSeriesEpisodeCatalog(linkedCatalog);
      }
      return;
    }

    target.episodeCatalogSource = null;
    target.episodeCatalogSourceId = null;
  }

  private warmSeriesEpisodeCatalog(link: EpisodeCatalogLink): void {
    if (link.source === 'jikan') {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(link.providerId);
      return;
    }

    this.tmdbMetadataService.warmSeriesEpisodeCatalog(link.providerId);
  }

  private resolveEpisodeCatalogLink(
    item: MediaItem,
  ): EpisodeCatalogLink | null {
    const linkedSource = this.normalizeEpisodeCatalogSource(
      this.normalizeOptionalString(item.episodeCatalogSource),
    );
    const linkedId = this.normalizeOptionalString(item.episodeCatalogSourceId);

    if (linkedSource && linkedId) {
      return {
        source: linkedSource,
        providerId: linkedId,
      };
    }

    if (item.remoteSource === 'tmdb' || item.remoteSource === 'jikan') {
      const remoteSourceId = this.normalizeOptionalString(item.remoteSourceId);
      if (remoteSourceId) {
        return {
          source: item.remoteSource,
          providerId: remoteSourceId,
        };
      }
    }

    return null;
  }

  private async loadSeriesEpisodeCatalog(
    link: EpisodeCatalogLink,
  ): Promise<NormalizedSeriesEpisodeCatalog | null> {
    try {
      if (link.source === 'jikan') {
        const catalog = await this.jikanMetadataService.getSeriesEpisodeCatalog(
          link.providerId,
        );
        if (!catalog || catalog.episodes.length === 0) {
          return null;
        }

        return {
          source: 'jikan',
          providerId: catalog.providerId,
          totalEpisodeCount: catalog.totalEpisodeCount,
          episodes: catalog.episodes.map((episode) => ({
            seasonNumber: 1,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            synopsis: episode.synopsis,
          })),
          updatedAt: catalog.updatedAt,
        };
      }

      const catalog = await this.tmdbMetadataService.getSeriesEpisodeCatalog(
        link.providerId,
      );
      if (!catalog || catalog.episodes.length === 0) {
        return null;
      }

      return {
        source: 'tmdb',
        providerId: catalog.providerId,
        totalEpisodeCount: catalog.totalEpisodeCount,
        episodes: catalog.episodes.map((episode) => ({
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          synopsis: episode.synopsis,
        })),
        updatedAt: catalog.updatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Series episode catalog load failed for ${link.source}:${link.providerId}: ${message}`,
      );
      return null;
    }
  }

  private episodeCatalogLinksEqual(
    left: EpisodeCatalogLink | null,
    right: EpisodeCatalogLink | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return left.source === right.source && left.providerId === right.providerId;
  }

  private collectSeriesItemsForEpisodeTracker(
    items: MediaItem[],
    current: MediaItem,
    catalogLink: EpisodeCatalogLink,
  ): MediaItem[] {
    const byLinkedSource = items.filter(
      (item) =>
        item.type === 'show' &&
        this.episodeCatalogLinksEqual(
          this.resolveEpisodeCatalogLink(item),
          catalogLink,
        ),
    );

    if (byLinkedSource.length > 0) {
      return byLinkedSource;
    }

    const normalizedTitle = normalizeForKey(current.title);
    return items.filter(
      (item) =>
        item.type === 'show' && normalizeForKey(item.title) === normalizedTitle,
    );
  }

  private coercePositiveEpisodeNumber(value: number | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }

  private coerceSeasonForTracker(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 1;
    }

    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : 1;
  }

  private normalizeImportedSubtitleDetails(
    value: unknown,
  ): MediaItem['subtitleDetails'] {
    if (!Array.isArray(value)) {
      return [];
    }

    const out: MediaItem['subtitleDetails'] = [];
    for (const entry of value) {
      if (!this.isObjectRecord(entry)) {
        continue;
      }

      const kind = entry['kind'];
      if (kind !== 'embedded' && kind !== 'external') {
        continue;
      }

      const label = this.readOptionalString(entry, 'label') ?? '';
      const source = this.readOptionalString(entry, 'source') ?? '';
      if (!label || !source) {
        continue;
      }

      out.push({
        kind,
        label,
        language: this.readOptionalString(entry, 'language'),
        source,
      });
    }

    return out;
  }

  private normalizeImportedChapterThumbnails(
    value: unknown,
  ): MediaItem['chapterThumbnails'] {
    if (!Array.isArray(value)) {
      return [];
    }

    const out: MediaItem['chapterThumbnails'] = [];
    for (const entry of value) {
      if (!this.isObjectRecord(entry)) {
        continue;
      }

      const imagePath = this.readOptionalString(entry, 'imagePath') ?? '';
      const second = this.readOptionalNumber(entry, 'second');
      if (
        !imagePath ||
        second === null ||
        !Number.isFinite(second) ||
        second < 0
      ) {
        continue;
      }

      out.push({
        imagePath,
        second,
      });
    }

    return out;
  }

  private normalizeImportedMediaDetails(
    value: unknown,
  ): MediaItem['mediaDetails'] {
    if (!this.isObjectRecord(value)) {
      return {
        formatName: null,
        bitRate: null,
        frameRate: null,
        audioChannels: null,
      };
    }

    return {
      formatName: this.readOptionalString(value, 'formatName'),
      bitRate: this.toNullableNumber(this.readOptionalNumber(value, 'bitRate')),
      frameRate: this.toNullableNumber(
        this.readOptionalNumber(value, 'frameRate'),
      ),
      audioChannels: this.toNullableNumber(
        this.readOptionalNumber(value, 'audioChannels'),
      ),
    };
  }

  private toNullableNumber(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  private toNonNegativeNumber(value: number | null, fallback = 0): number {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return value;
  }

  private toNonNegativeInteger(value: number | null, fallback = 0): number {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return Math.floor(value);
  }

  private toNonNegativeNullableInteger(value: number | null): number | null {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.floor(value);
  }

  private normalizeImportedTimestamp(
    value: string | null,
    fallback: string,
  ): string {
    if (!value) {
      return fallback;
    }

    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return new Date(parsed).toISOString();
  }

  private async toPortableExportItem(
    item: MediaItem,
    pathContext: MetadataImportPathContext,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<MediaItem> {
    const portableRelativePath = this.toPortableRelativePath(item, pathContext);
    const portableFilePath = portableRelativePath || basename(item.filePath);
    const previewImagePath = await this.exportImagePathAsAsset(
      item.previewImagePath,
      imageAssets,
    );
    const backdropImagePath = await this.exportImagePathAsAsset(
      item.backdropImagePath,
      imageAssets,
    );

    return {
      ...item,
      relativePath: portableRelativePath,
      filePath: portableFilePath,
      previewImagePath,
      backdropImagePath,
      // Chapter thumbnails are intentionally omitted from portable exports
      // because they are machine-local cache artifacts and can be regenerated.
      chapterThumbnails: [],
    };
  }

  private toPortableRelativePath(
    item: MediaItem,
    context: MetadataImportPathContext,
  ): string {
    const rootsByLength = [...context.roots].sort(
      (left, right) => right.length - left.length,
    );
    const trimmedFilePath = item.filePath?.trim() ?? '';

    if (trimmedFilePath && isAbsolute(trimmedFilePath)) {
      const absolutePath = resolve(trimmedFilePath);

      for (const root of rootsByLength) {
        const rel = relative(root, absolutePath);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
          continue;
        }

        return rel.split(sep).join('/');
      }
    }

    const fallbackRelative = this.normalizeImportedRelativePath(
      item.relativePath || basename(trimmedFilePath),
    );
    const segments = fallbackRelative.split('/').filter(Boolean);

    if (
      segments.length > 1 &&
      context.rootByLabel.has(segments[0].toLowerCase())
    ) {
      return segments.slice(1).join('/');
    }

    return fallbackRelative;
  }

  private async exportImagePathAsAsset(
    imagePath: string | null,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<string | null> {
    if (!imagePath) {
      return null;
    }

    const trimmed = imagePath.trim();
    if (!trimmed) {
      return null;
    }

    if (this.isRemoteUrl(trimmed)) {
      return trimmed;
    }

    const resolvedPath = resolve(trimmed);
    let payload: Buffer;

    try {
      payload = await readFileBuffer(resolvedPath);
    } catch {
      return null;
    }

    if (payload.length === 0) {
      return null;
    }

    const assetId = createHash('sha1').update(payload).digest('hex');
    if (!imageAssets[assetId]) {
      const lookedUpMimeType = lookup(resolvedPath);
      imageAssets[assetId] = {
        mimeType:
          typeof lookedUpMimeType === 'string'
            ? lookedUpMimeType
            : 'application/octet-stream',
        base64: payload.toString('base64'),
      };
    }

    return `${this.imageAssetPrefix}${assetId}`;
  }

  private async restorePortableImagePaths(
    item: MediaItem,
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<MediaItem> {
    const [previewImagePath, backdropImagePath] = await Promise.all([
      this.restorePortableImagePath(
        item.previewImagePath,
        'poster',
        imageAssets,
        restoredAssetPathById,
      ),
      this.restorePortableImagePath(
        item.backdropImagePath,
        'backdrop',
        imageAssets,
        restoredAssetPathById,
      ),
    ]);

    return {
      ...item,
      previewImagePath,
      backdropImagePath,
    };
  }

  private async restorePortableImagePath(
    imagePath: string | null,
    variant: 'poster' | 'backdrop',
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<string | null> {
    if (!imagePath) {
      return null;
    }

    const trimmed = imagePath.trim();
    if (!trimmed) {
      return null;
    }

    if (this.isRemoteUrl(trimmed)) {
      return trimmed;
    }

    if (!trimmed.startsWith(this.imageAssetPrefix)) {
      return this.looksWindowsAbsolutePath(trimmed) ? null : trimmed;
    }

    const assetId = trimmed.slice(this.imageAssetPrefix.length).trim();
    if (!assetId || !imageAssets) {
      return null;
    }

    const cachedPath = restoredAssetPathById.get(assetId);
    if (cachedPath) {
      return cachedPath;
    }

    const asset = imageAssets[assetId];
    if (!asset) {
      return null;
    }

    const restoredPath = await this.writeImportedImageAsset(
      assetId,
      asset,
      variant,
    );

    if (restoredPath) {
      restoredAssetPathById.set(assetId, restoredPath);
    }

    return restoredPath;
  }

  private async writeImportedImageAsset(
    assetId: string,
    asset: MetadataExportImageAsset,
    variant: 'poster' | 'backdrop',
  ): Promise<string | null> {
    if (!asset.base64 || typeof asset.base64 !== 'string') {
      return null;
    }

    let payload: Buffer;
    try {
      payload = Buffer.from(asset.base64, 'base64');
    } catch {
      return null;
    }

    if (payload.length === 0) {
      return null;
    }

    const extension = this.imageExtensionFromMime(asset.mimeType);
    const targetDirectory =
      variant === 'poster'
        ? this.posterThumbnailDir
        : this.backdropThumbnailDir;
    const outputPath = join(targetDirectory, `${assetId}${extension}`);

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(outputPath, payload);
      return outputPath;
    } catch {
      return null;
    }
  }

  private imageExtensionFromMime(mimeType: string): string {
    const normalized = (mimeType || '').trim().toLowerCase();

    if (normalized.includes('png')) {
      return '.png';
    }

    if (normalized.includes('webp')) {
      return '.webp';
    }

    if (normalized.includes('gif')) {
      return '.gif';
    }

    if (normalized.includes('jpeg') || normalized.includes('jpg')) {
      return '.jpg';
    }

    return '.jpg';
  }

  private looksWindowsAbsolutePath(value: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  }

  private async createImportPathContext(): Promise<MetadataImportPathContext> {
    const roots = (await this.resolveScanLocations()).map((location) =>
      resolve(location),
    );
    const rootByLabel = new Map<string, string>();

    for (const root of roots) {
      const label = basename(root).trim().toLowerCase();
      if (!label || rootByLabel.has(label)) {
        continue;
      }

      rootByLabel.set(label, root);
    }

    return {
      roots,
      rootByLabel,
    };
  }

  private normalizeImportedRelativePath(value: string): string {
    const normalized = value
      .replace(/[\\/]+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim();

    if (!normalized) {
      throw new BadRequestException('Imported relativePath cannot be empty.');
    }

    return normalized;
  }

  private async resolveImportedFilePathWithinLocations(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): Promise<ResolvedMediaLocationPath> {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    for (const candidate of candidates) {
      if (!(await this.fileExists(candidate))) {
        continue;
      }

      const matchedLocation = this.matchPathToMediaLocation(candidate, context);
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    const fuzzyResolved = await this.mediaPathResolver.resolveRelativePathFuzzy(
      relativePath,
      context,
    );
    if (fuzzyResolved) {
      const matchedLocation = this.matchPathToMediaLocation(
        fuzzyResolved,
        context,
      );
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    throw new NotFoundException(
      'Imported media file does not exist in configured media locations.',
    );
  }

  private matchPathToMediaLocation(
    filePath: string,
    context: MetadataImportPathContext,
  ): ResolvedMediaLocationPath | null {
    const absoluteFilePath = resolve(filePath);
    const sortedRoots = [...context.roots].sort(
      (left, right) => right.length - left.length,
    );

    for (const root of sortedRoots) {
      const relativeToRoot = relative(root, absoluteFilePath);
      if (
        !relativeToRoot ||
        relativeToRoot.startsWith('..') ||
        isAbsolute(relativeToRoot)
      ) {
        continue;
      }

      const normalizedRelative = relativeToRoot.split(sep).join('/');
      const locationLabel = basename(root).trim() || root;

      return {
        absoluteFilePath,
        locationRoot: root,
        locationLabel,
        relativePathUnderLocation: normalizedRelative,
      };
    }

    return null;
  }

  private async resolveRecycleDeletionBases(): Promise<string[]> {
    const scanLocations = await this.resolveScanLocations();
    const driveRoots = this.collectDriveRoots(scanLocations);

    return driveRoots
      .map((driveRoot) =>
        resolve(
          join(
            driveRoot,
            this.recycleRootFolderName,
            this.recycleDeleteCategoryName,
          ),
        ),
      )
      .filter((value, index, all) => all.indexOf(value) === index);
  }

  private collectDriveRoots(locations: readonly string[]): string[] {
    const driveRoots = new Set<string>();

    for (const location of locations) {
      const absoluteLocation = resolve(location);
      const parsedRoot = parse(absoluteLocation).root || absoluteLocation;
      driveRoots.add(resolve(parsedRoot));
    }

    return [...driveRoots].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private async collectStorageSourcePaths(
    locations: readonly string[],
  ): Promise<string[]> {
    const sourcePathByDeviceKey = new Map<string, string>();
    const fallbackSourcePaths = new Set<string>();

    for (const location of locations) {
      const candidates = this.toStoragePathCandidates(location);
      if (candidates.length === 0) {
        continue;
      }

      let matchedDevice = false;

      for (const candidate of candidates) {
        const deviceKey = await this.readStorageDeviceKey(candidate);
        if (!deviceKey) {
          continue;
        }

        if (!sourcePathByDeviceKey.has(deviceKey)) {
          sourcePathByDeviceKey.set(deviceKey, candidate);
        }

        matchedDevice = true;
        break;
      }

      if (!matchedDevice) {
        fallbackSourcePaths.add(candidates[0]);
      }
    }

    const deduped = [...sourcePathByDeviceKey.values()];
    const dedupeKeySet = new Set(
      deduped.map((pathValue) => this.toStoragePathKey(pathValue)),
    );

    for (const fallbackPath of fallbackSourcePaths) {
      const key = this.toStoragePathKey(fallbackPath);
      if (dedupeKeySet.has(key)) {
        continue;
      }

      dedupeKeySet.add(key);
      deduped.push(fallbackPath);
    }

    return deduped;
  }

  private toStoragePathCandidates(location: string): string[] {
    const trimmed = location.trim();
    if (!trimmed) {
      return [];
    }

    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: string) => {
      const cleaned = candidate.trim();
      if (!cleaned) {
        return;
      }

      const key = this.toStoragePathKey(cleaned);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      candidates.push(cleaned);
    };

    addCandidate(trimmed);
    addCandidate(resolve(trimmed));

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 1) {
      const prefix = trimmed.slice(0, colonIndex);
      const suffix = trimmed.slice(colonIndex + 1).trim();

      if (!/^[A-Za-z]$/.test(prefix) && suffix.startsWith('/')) {
        addCandidate(suffix);
        addCandidate(resolve(suffix));
      }
    }

    return candidates;
  }

  private toStoragePathKey(pathValue: string): string {
    return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
  }

  private async readStorageDeviceKey(
    pathValue: string,
  ): Promise<string | null> {
    try {
      const pathStats = await stat(pathValue);
      if (!pathStats.isDirectory()) {
        return null;
      }

      const deviceNumber = Number(pathStats.dev);
      if (!Number.isFinite(deviceNumber)) {
        return null;
      }

      return `dev:${deviceNumber}`;
    } catch {
      return null;
    }
  }

  private async readDriveStorageSnapshot(
    driveRoot: string,
  ): Promise<MediaDriveStorageSnapshot | null> {
    try {
      const stats = await statfs(driveRoot, { bigint: true });

      if (this.shouldUseFsutilFallback(stats, driveRoot)) {
        const fsutilSnapshot =
          await this.readDriveStorageSnapshotViaFsutil(driveRoot);
        if (fsutilSnapshot) {
          return fsutilSnapshot;
        }
      }

      const blockSize = this.toFiniteStatfsValue(stats.bsize);
      const totalBlocks = this.toFiniteStatfsValue(stats.blocks);
      const availableBlocks =
        this.toFiniteStatfsValue(stats.bfree) ??
        this.toFiniteStatfsValue(stats.bavail);

      if (blockSize === null || availableBlocks === null) {
        return null;
      }

      const computedAvailableBytes = Math.max(
        0,
        Math.round(blockSize * availableBlocks),
      );
      const totalBytes =
        totalBlocks === null
          ? computedAvailableBytes
          : Math.max(0, Math.round(blockSize * totalBlocks));
      const availableBytes =
        totalBlocks === null
          ? computedAvailableBytes
          : Math.min(totalBytes, computedAvailableBytes);
      const usedBytes = Math.max(0, totalBytes - availableBytes);

      return {
        totalBytes,
        usedBytes,
        availableBytes,
      };
    } catch {
      return null;
    }
  }

  private shouldUseFsutilFallback(
    stats: {
      blocks: number | bigint;
      bfree: number | bigint;
      bavail: number | bigint;
    },
    pathValue: string,
  ): boolean {
    if (process.platform !== 'win32' || !this.isUncPath(pathValue)) {
      return false;
    }

    const maxUint32 = 4_294_967_295n;
    const blocks = this.toBigintStatfsValue(stats.blocks);
    const bfree = this.toBigintStatfsValue(stats.bfree);
    const bavail = this.toBigintStatfsValue(stats.bavail);

    return blocks === maxUint32 || bfree === maxUint32 || bavail === maxUint32;
  }

  private isUncPath(pathValue: string): boolean {
    return pathValue.startsWith('\\\\');
  }

  private toBigintStatfsValue(value: number | bigint): bigint | null {
    if (typeof value === 'bigint') {
      return value;
    }

    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return BigInt(Math.trunc(value));
  }

  private async readDriveStorageSnapshotViaFsutil(
    pathValue: string,
  ): Promise<MediaDriveStorageSnapshot | null> {
    return await new Promise<MediaDriveStorageSnapshot | null>(
      (resolvePromise) => {
        let settled = false;
        const settle = (value: MediaDriveStorageSnapshot | null) => {
          if (settled) {
            return;
          }

          settled = true;
          resolvePromise(value);
        };

        let child: ReturnType<typeof spawn>;
        try {
          child = spawn('fsutil', ['volume', 'diskfree', pathValue], {
            windowsHide: true,
          });
        } catch {
          settle(null);
          return;
        }

        let output = '';

        child.stdout?.on('data', (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.stderr?.on('data', (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.on('error', () => {
          settle(null);
        });

        child.on('close', () => {
          const totalBytes = this.parseFsutilBytes(output, 'Total bytes');
          const freeBytes = this.parseFsutilBytes(output, 'Total free bytes');

          if (totalBytes === null || freeBytes === null) {
            settle(null);
            return;
          }

          const availableBytes = Math.max(0, Math.min(totalBytes, freeBytes));
          const usedBytes = Math.max(0, totalBytes - availableBytes);

          settle({
            totalBytes,
            usedBytes,
            availableBytes,
          });
        });

        const timer = setTimeout(() => {
          try {
            child.kill();
          } catch {
            // Ignore kill errors.
          }

          settle(null);
        }, 5000);

        child.on('close', () => {
          clearTimeout(timer);
        });
      },
    );
  }

  private parseFsutilBytes(output: string, label: string): number | null {
    const pattern = new RegExp(`${label}\\s*:\\s*([0-9,]+)`, 'i');
    const match = output.match(pattern);

    if (!match) {
      return null;
    }

    const value = Number.parseInt(match[1].replace(/,/g, ''), 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  private toFiniteStatfsValue(value: number | bigint): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  private toPercent(value: number, total: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return 0;
    }

    const ratio = value / total;
    return Math.max(0, Math.min(100, Math.round(ratio * 1000) / 10));
  }

  private async collectRecycleDeletionEntries(
    basePaths: readonly string[],
  ): Promise<RecycleDeletionEntry[]> {
    const entries: RecycleDeletionEntry[] = [];

    for (const basePath of basePaths) {
      const resolvedBasePath = resolve(basePath);
      let directoryEntries: Dirent[] = [];

      try {
        directoryEntries = await readdir(resolvedBasePath, {
          withFileTypes: true,
        });
      } catch {
        continue;
      }

      for (const entry of directoryEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const operationPath = resolve(resolvedBasePath, entry.name);

        try {
          const operationStats = await stat(operationPath);
          if (!operationStats.isDirectory()) {
            continue;
          }

          const operationSummary =
            await this.summarizeRecycleOperation(operationPath);
          const driveRoot = parse(resolvedBasePath).root || resolvedBasePath;

          entries.push({
            operationId: entry.name,
            driveRoot,
            folderPath: operationPath,
            createdAt:
              operationStats.birthtimeMs > 0
                ? new Date(operationStats.birthtimeMs).toISOString()
                : null,
            updatedAt: new Date(
              Math.max(operationStats.mtimeMs, operationStats.ctimeMs),
            ).toISOString(),
            sizeBytes: operationSummary.sizeBytes,
            fileCount: operationSummary.fileCount,
          });
        } catch {
          continue;
        }
      }
    }

    return entries;
  }

  private async summarizeRecycleOperation(operationPath: string): Promise<{
    sizeBytes: number;
    fileCount: number;
  }> {
    const pendingDirectories = [operationPath];
    let sizeBytes = 0;
    let fileCount = 0;

    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.pop();
      if (!currentDirectory) {
        continue;
      }

      let entries: Dirent[] = [];
      try {
        entries = await readdir(currentDirectory, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = resolve(currentDirectory, entry.name);

        if (entry.isDirectory()) {
          pendingDirectories.push(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        try {
          const fileStats = await stat(fullPath);
          if (!fileStats.isFile()) {
            continue;
          }

          fileCount += 1;
          sizeBytes += fileStats.size;
        } catch {
          continue;
        }
      }
    }

    return { sizeBytes, fileCount };
  }

  private isValidRecycleOperationPath(
    operationPath: string,
    basePaths: readonly string[],
  ): boolean {
    const resolvedOperationPath = resolve(operationPath);

    for (const basePath of basePaths) {
      const resolvedBasePath = resolve(basePath);
      const rel = relative(resolvedBasePath, resolvedOperationPath);

      if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
        continue;
      }

      const depth = rel.split(/[\\/]+/).filter(Boolean).length;
      if (depth === 1) {
        return true;
      }
    }

    return false;
  }

  private normalizeRecycleOperationPaths(
    paths: readonly string[] | undefined,
  ): string[] {
    if (!Array.isArray(paths)) {
      return [];
    }

    const normalizedByKey = new Map<string, string>();
    for (const path of paths) {
      if (typeof path !== 'string') {
        continue;
      }

      const cleaned = path.trim();
      if (!cleaned) {
        continue;
      }

      const resolvedPath = resolve(cleaned);
      normalizedByKey.set(resolvedPath.toLowerCase(), resolvedPath);
    }

    return [...normalizedByKey.values()];
  }

  private rebaseImportedFilePath(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): string {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    if (candidates.length === 0) {
      throw new BadRequestException('Imported filePath cannot be empty.');
    }

    return candidates[0];
  }

  private extractImportedItems(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (this.isObjectRecord(value) && Array.isArray(value['items'])) {
      return value['items'] as unknown[];
    }

    throw new BadRequestException(
      'Import file must contain an items array at the top level.',
    );
  }

  private extractImportedImageAssets(
    value: unknown,
  ): Record<string, MetadataExportImageAsset> | null {
    if (
      !this.isObjectRecord(value) ||
      !this.isObjectRecord(value['imageAssets'])
    ) {
      return null;
    }

    const rawAssets = value['imageAssets'];
    const normalized: Record<string, MetadataExportImageAsset> = {};

    for (const [assetId, candidate] of Object.entries(rawAssets)) {
      if (!this.isObjectRecord(candidate)) {
        continue;
      }

      const mimeType =
        typeof candidate['mimeType'] === 'string'
          ? candidate['mimeType'].trim()
          : '';
      const base64 =
        typeof candidate['base64'] === 'string'
          ? candidate['base64'].trim()
          : '';

      if (!assetId || !mimeType || !base64) {
        continue;
      }

      normalized[assetId] = {
        mimeType,
        base64,
      };
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  private readRequiredString(
    source: Record<string, unknown>,
    key: string,
    context: string,
  ): string {
    const value = this.readOptionalString(source, key);
    if (!value) {
      throw new BadRequestException(`Invalid or missing ${context}.${key}.`);
    }

    return value;
  }

  private readOptionalString(
    source: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = source[key];
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }

  private readOptionalNumber(
    source: Record<string, unknown>,
    key: string,
  ): number | null {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  private readStringArray(
    source: Record<string, unknown>,
    key: string,
  ): string[] {
    const value = source[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  async getPlaybackAudioTracks(mediaId: string): Promise<PlaybackAudioTrack[]> {
    const item = await this.getById(mediaId);
    const systemSettings = await this.systemSettingsService.getSettings();
    const ffprobePath = systemSettings.ffprobePath || 'ffprobe';

    const canonicalFilePath = await this.resolveMediaFilePath(
      item.filePath,
      item.relativePath,
    ).catch(() => item.filePath);
    const probePath = await this.resolvePlaybackProbePath(canonicalFilePath);

    try {
      const payload = await this.mediaProbeAdapter.probeFile(
        probePath,
        ffprobePath,
      );
      const streams = Array.isArray(payload.streams) ? payload.streams : [];
      const audioStreams = streams.filter(
        (stream) =>
          stream.codec_type === 'audio' &&
          Number.isInteger(stream.index) &&
          stream.index >= 0,
      );

      if (audioStreams.length === 0) {
        return [];
      }

      const defaultStreamIndex =
        audioStreams.find((stream) => (stream.disposition?.default ?? 0) > 0)
          ?.index ?? audioStreams[0].index;

      return audioStreams.map((stream, position) => {
        const language = this.normalizePlaybackTrackLanguage(
          stream.tags?.language,
        );
        const codec = this.normalizePlaybackTrackCodec(stream.codec_name);
        const channels =
          typeof stream.channels === 'number' &&
          Number.isFinite(stream.channels)
            ? Math.max(1, Math.round(stream.channels))
            : null;
        const title = stream.tags?.title?.trim() || '';

        return {
          streamIndex: stream.index,
          label: this.buildPlaybackTrackLabel({
            fallbackPosition: position + 1,
            title,
            language,
            codec,
            channels,
          }),
          language,
          codec,
          channels,
          isDefault: stream.index === defaultStreamIndex,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to list audio tracks for ${item.relativePath}: ${message}`,
      );
      return [];
    }
  }

  async getPlaybackPlan(mediaId: string) {
    const item = await this.getById(mediaId);
    const torrentIndex =
      (await this.torrentMediaIndexStore.getByMediaId(item.id)) ??
      (await this.torrentMediaIndexStore.getByRelatedFilePath(item.filePath));

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
      torrent: torrentIndex
        ? {
            hash: torrentIndex.hash,
            statusUrl: `/api/media/torrent/${torrentIndex.hash}/status`,
          }
        : null,
    };
  }

  async getTorrentDownloadProgressByMediaIds(mediaIds: string[]) {
    const normalizedMediaIds = [
      ...new Set(
        mediaIds
          .map((mediaId) => mediaId.trim())
          .filter((mediaId) => mediaId.length > 0),
      ),
    ];

    if (normalizedMediaIds.length === 0) {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    const indexByMediaId =
      await this.torrentMediaIndexStore.getByMediaIds(normalizedMediaIds);

    if (indexByMediaId.size === 0) {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    let torrents: TorrentListItem[] = [];
    try {
      const listResult = await this.torrentService.listTorrents();
      torrents = Array.isArray(listResult.items) ? listResult.items : [];
    } catch {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    const activeTorrentsByHash = new Map<string, TorrentListItem>();
    for (const torrent of torrents) {
      const normalizedHash = torrent.hash.trim().toLowerCase();
      if (!normalizedHash) {
        continue;
      }

      if (!this.isActiveDownloadingTorrentState(torrent.state)) {
        continue;
      }

      activeTorrentsByHash.set(normalizedHash, torrent);
    }

    const items: MediaTorrentDownloadProgressItem[] = [];
    for (const mediaId of normalizedMediaIds) {
      const indexEntry = indexByMediaId.get(mediaId);
      if (!indexEntry) {
        continue;
      }

      const torrent = activeTorrentsByHash.get(indexEntry.hash);
      if (!torrent) {
        continue;
      }

      const normalizedProgress = Number.isFinite(torrent.progress)
        ? Math.min(1, Math.max(0, torrent.progress))
        : 0;

      items.push({
        mediaId,
        hash: indexEntry.hash,
        progressPercent: normalizedProgress * 100,
        state: torrent.state,
      });
    }

    return { items };
  }

  private isActiveDownloadingTorrentState(
    state: string | null | undefined,
  ): boolean {
    if (!state) {
      return false;
    }

    const normalized = state.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (MediaService.ACTIVE_TORRENT_DOWNLOAD_STATES.has(normalized)) {
      return true;
    }

    return normalized.includes('dl');
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

  private async resolvePlaybackProbePath(
    canonicalFilePath: string,
  ): Promise<string> {
    if (await this.fileExists(canonicalFilePath)) {
      return canonicalFilePath;
    }

    const inProgressPath = `${canonicalFilePath}.!qB`;
    if (await this.fileExists(inProgressPath)) {
      return inProgressPath;
    }

    return canonicalFilePath;
  }

  private normalizePlaybackTrackLanguage(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private normalizePlaybackTrackCodec(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private buildPlaybackTrackLabel(input: {
    fallbackPosition: number;
    title: string;
    language: string | null;
    codec: string | null;
    channels: number | null;
  }): string {
    if (input.title) {
      return input.title;
    }

    const details: string[] = [];
    if (input.language) {
      details.push(input.language.toUpperCase());
    }
    if (input.codec) {
      details.push(input.codec.toUpperCase());
    }
    if (input.channels !== null) {
      details.push(`${input.channels}ch`);
    }

    if (details.length === 0) {
      return `Track ${input.fallbackPosition}`;
    }

    return `Track ${input.fallbackPosition} (${details.join(', ')})`;
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

  async streamBackdropImage(
    mediaId: string,
    response: Response,
  ): Promise<void> {
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

  private normalizeRemoteProviders(
    providers: readonly RemoteMediaProvider[] | undefined,
  ): RemoteMediaProvider[] {
    if (!Array.isArray(providers) || providers.length === 0) {
      return ['tmdb', 'jikan'];
    }

    const deduped = new Set<RemoteMediaProvider>();
    for (const provider of providers) {
      if (typeof provider !== 'string') {
        continue;
      }

      if (provider === 'tmdb' || provider === 'jikan') {
        deduped.add(provider);
      }
    }

    return deduped.size > 0 ? [...deduped] : ['tmdb', 'jikan'];
  }

  private buildRemoteSearchProbes(
    query: string,
    requestedTags: readonly string[],
  ): string[] {
    const probes = new Set<string>();

    const addProbe = (value: string) => {
      const cleaned = value.trim();
      if (cleaned.length >= 2) {
        probes.add(cleaned);
      }
    };

    addProbe(query);

    for (const tag of requestedTags) {
      addProbe(tag);

      const tokenized = tag
        .split(/[^a-z0-9]+/i)
        .map((value) => value.trim())
        .filter((value) => value.length >= 3)
        .slice(0, 4);

      if (tokenized.length >= 2) {
        addProbe(tokenized.join(' '));
      }
    }

    return [...probes].slice(0, 4);
  }

  private async collectTmdbRemoteCandidates(
    searchProbes: readonly string[],
    providerLimit: number,
    useCache: boolean,
  ): Promise<TmdbRemoteCandidate[]> {
    const candidates: TmdbRemoteCandidate[] = [];

    for (const probe of searchProbes) {
      const payload = await this.tmdbMetadataService.searchRemoteCandidates({
        title: probe,
        limit: providerLimit,
        useCache,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectJikanRemoteCandidates(
    searchProbes: readonly string[],
    providerLimit: number,
    useCache: boolean,
  ): Promise<JikanRemoteCandidate[]> {
    const candidates: JikanRemoteCandidate[] = [];

    for (const probe of searchProbes) {
      const payload = await this.jikanMetadataService.searchCandidates({
        title: probe,
        limit: providerLimit,
        useCache,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectTmdbRemoteTagCandidates(
    tags: readonly string[],
    providerLimit: number,
    useCache: boolean,
    page: number,
  ): Promise<TmdbRemoteCandidate[]> {
    const candidates: TmdbRemoteCandidate[] = [];

    for (const tag of tags) {
      const payload =
        await this.tmdbMetadataService.searchRemoteCandidatesByTag({
          tag,
          limit: providerLimit,
          useCache,
          page,
        });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectJikanRemoteTagCandidates(
    tags: readonly string[],
    providerLimit: number,
    useCache: boolean,
    page: number,
  ): Promise<JikanRemoteCandidate[]> {
    const candidates: JikanRemoteCandidate[] = [];

    for (const tag of tags) {
      const payload = await this.jikanMetadataService.searchCandidatesByTag({
        tag,
        limit: providerLimit,
        useCache,
        page,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private matchesRemoteTagFilters(
    candidate: RemoteMediaCandidate,
    requestedTags: readonly string[],
  ): boolean {
    if (requestedTags.length === 0) {
      return true;
    }

    const candidateTags = this.toNormalizedTagSet(candidate.tags);
    if (candidateTags.size === 0) {
      return false;
    }

    return requestedTags.some((tag) => candidateTags.has(tag));
  }

  private hasUsefulRemoteCandidate(candidate: RemoteMediaCandidate): boolean {
    const title = candidate.title.trim();
    if (!title) {
      return false;
    }

    if (candidate.mediaType !== 'movie' && candidate.mediaType !== 'show') {
      return false;
    }

    return true;
  }

  private parseRemoteMediaId(mediaId: string): ParsedRemoteMediaId | null {
    const cleanedId = mediaId.trim();
    const match = cleanedId.match(
      /^remote_(tmdb|jikan)_(movie|show)_([A-Za-z0-9-]{1,64})$/,
    );

    if (!match) {
      return null;
    }

    return {
      provider: match[1] as RemoteMediaProvider,
      mediaType: match[2] as 'movie' | 'show',
      providerId: match[3],
    };
  }

  private toRemoteMediaItem(candidate: RemoteMediaCandidate): MediaItem {
    const now = new Date().toISOString();
    const sourceLabel = this.remoteSourceLabel(candidate.provider);

    return {
      id: `remote_${candidate.provider}_${candidate.mediaType}_${candidate.providerId}`,
      title: candidate.title,
      normalizedTitle: normalizeForKey(candidate.title),
      tags: this.normalizeEditableTags(candidate.tags ?? []),
      description: candidate.overview,
      releaseYear: candidate.releaseYear,
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      dedupeKey: `remote:${candidate.provider}:${candidate.mediaType}:${candidate.providerId}`,
      relativePath: `Remote catalog result (${sourceLabel})`,
      filePath: `remote://${candidate.provider}/${candidate.providerId}`,
      extension: '.api',
      container: null,
      type: candidate.mediaType,
      digitalMediaType: 'video',
      sizeBytes: 0,
      durationSeconds:
        typeof candidate.runtimeSeconds === 'number' &&
        Number.isFinite(candidate.runtimeSeconds) &&
        candidate.runtimeSeconds > 0
          ? Math.round(candidate.runtimeSeconds)
          : 0,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      subtitleStreams: 0,
      subtitleDetails: [],
      previewImagePath: candidate.posterUrl,
      backdropImagePath: candidate.backdropUrl,
      chapterThumbnails: [],
      mediaDetails: {
        formatName: null,
        bitRate: null,
        frameRate: null,
        audioChannels: null,
      },
      metadataRefreshedAt: now,
      updatedAt: now,
      isRemote: true,
      remoteSource: candidate.provider,
      remoteSourceId: candidate.providerId,
      remoteSourceLabel: sourceLabel,
    };
  }

  private remoteSourceLabel(provider: RemoteMediaProvider): string {
    return provider === 'tmdb' ? 'TMDB' : 'Jikan';
  }

  private normalizeRemoteTitleForKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private remoteCandidateDedupeKey(candidate: RemoteMediaCandidate): string {
    const normalizedTitle = this.normalizeRemoteTitleForKey(candidate.title);
    const year =
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
        ? Math.floor(candidate.releaseYear)
        : 0;

    return `${candidate.mediaType}:${normalizedTitle}:y${year}`;
  }

  private buildLocalTitleIndex(
    items: MediaItem[],
  ): Map<string, Set<number | null>> {
    const index = new Map<string, Set<number | null>>();

    for (const item of items) {
      const mediaType: 'movie' | 'show' =
        item.type === 'show' ? 'show' : 'movie';
      const normalizedTitle = this.normalizeRemoteTitleForKey(item.title);
      if (!normalizedTitle) {
        continue;
      }

      const key = `${mediaType}:${normalizedTitle}`;
      const years = index.get(key) ?? new Set<number | null>();
      const year =
        typeof item.releaseYear === 'number' &&
        Number.isFinite(item.releaseYear)
          ? Math.floor(item.releaseYear)
          : null;

      years.add(year);
      index.set(key, years);
    }

    return index;
  }

  private isAlreadyIndexedLocally(
    candidate: RemoteMediaCandidate,
    localTitleIndex: Map<string, Set<number | null>>,
  ): boolean {
    const normalizedTitle = this.normalizeRemoteTitleForKey(candidate.title);
    if (!normalizedTitle) {
      return false;
    }

    const titleKey = `${candidate.mediaType}:${normalizedTitle}`;
    const knownYears = localTitleIndex.get(titleKey);
    if (!knownYears || knownYears.size === 0) {
      return false;
    }

    const candidateYear =
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
        ? Math.floor(candidate.releaseYear)
        : null;

    if (knownYears.has(candidateYear)) {
      return true;
    }

    // If either side does not know the year, prefer suppressing duplicates.
    if (candidateYear === null || knownYears.has(null)) {
      return true;
    }

    return false;
  }

  private remoteCandidateScore(candidate: RemoteMediaCandidate): number {
    let score = 0;

    if (candidate.posterUrl) {
      score += 4;
    }
    if (candidate.backdropUrl) {
      score += 3;
    }
    if (candidate.overview) {
      score += 2;
    }
    if (candidate.releaseYear) {
      score += 1;
    }
    if (candidate.runtimeSeconds && candidate.runtimeSeconds > 0) {
      score += 1;
    }
    if (candidate.provider === 'tmdb') {
      score += 0.25;
    }

    return score;
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
    const deleteOperationId = randomUUID();
    let deletedEntries = 0;

    for (const targetPath of deletionTargets) {
      try {
        if (
          await this.moveFileToRecycleIfExists(targetPath, deleteOperationId)
        ) {
          deletedEntries += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Recycle move failed for ${targetPath}: ${message}. Falling back to permanent delete.`,
        );

        if (await this.removeFileIfExists(targetPath)) {
          deletedEntries += 1;
        }
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

  private async moveFileToRecycleIfExists(
    filePath: string,
    deleteOperationId: string,
  ): Promise<boolean> {
    if (!(await this.mediaFsFileOpsService.pathExists(filePath))) {
      return false;
    }

    const recyclePath = await this.resolveUniqueRecyclePath(
      filePath,
      deleteOperationId,
    );
    await this.mediaFsFileOpsService.moveFile(filePath, recyclePath);
    return true;
  }

  private async resolveUniqueRecyclePath(
    sourcePath: string,
    deleteOperationId: string,
  ): Promise<string> {
    const preferredPath = this.buildRecyclePath(sourcePath, deleteOperationId);
    if (!(await this.mediaFsFileOpsService.pathExists(preferredPath))) {
      return preferredPath;
    }

    const extension = extname(preferredPath);
    const withoutExtension = extension
      ? preferredPath.slice(0, preferredPath.length - extension.length)
      : preferredPath;

    for (let counter = 1; counter <= 1000; counter += 1) {
      const candidate = `${withoutExtension}.${counter}${extension}`;
      if (!(await this.mediaFsFileOpsService.pathExists(candidate))) {
        return candidate;
      }
    }

    return `${withoutExtension}.${randomUUID()}${extension}`;
  }

  private buildRecyclePath(
    sourcePath: string,
    deleteOperationId: string,
  ): string {
    const absolutePath = resolve(sourcePath);
    const parsed = parse(absolutePath);
    const rootPath = parsed.root;

    if (!rootPath) {
      return join(
        dirname(absolutePath),
        this.recycleRootFolderName,
        this.recycleDeleteCategoryName,
        deleteOperationId,
        basename(absolutePath),
      );
    }

    const relativeToRoot = relative(rootPath, absolutePath);
    const safeRelative =
      relativeToRoot &&
      !relativeToRoot.startsWith('..') &&
      !isAbsolute(relativeToRoot)
        ? relativeToRoot
        : basename(absolutePath);

    return join(
      rootPath,
      this.recycleRootFolderName,
      this.recycleDeleteCategoryName,
      deleteOperationId,
      safeRelative,
    );
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

  private async removeDirectoryIfExists(
    directoryPath: string,
  ): Promise<boolean> {
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
      existingItem: MediaItem | null;
    };

    try {
      this.mediaScanStore.update(scanId, {
        phase: 'collecting',
        message: 'Collecting media files...',
      });

      const existingItems = await this.mediaStore.all();
      const existingItemByFilePathKey = new Map(
        existingItems.map((item) => [this.toFilePathKey(item.filePath), item]),
      );

      const sourceFiles: SourceFile[] = [];
      let discoveredFiles = 0;
      let skippedIndexedFiles = 0;
      let refreshQueuedFiles = 0;
      let newQueuedFiles = 0;

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
          discoveredFiles += 1;

          const filePathKey = this.toFilePathKey(filePath);
          const existingItem =
            existingItemByFilePathKey.get(filePathKey) ?? null;
          if (existingItem && !this.shouldRefreshIndexedItem(existingItem)) {
            skippedIndexedFiles += 1;
            continue;
          }

          const relativePath = relative(normalizedRoot, filePath)
            .split(sep)
            .join('/');

          sourceFiles.push({
            sourcePath,
            locationLabel,
            filePath,
            displayPath: `${locationLabel}/${relativePath}`,
            existingItem,
          });

          if (existingItem) {
            refreshQueuedFiles += 1;
          } else {
            newQueuedFiles += 1;
          }
        }

        this.mediaScanStore.update(scanId, {
          totalFiles: sourceFiles.length,
          skippedIndexedFiles,
        });
      }

      const probingMessage =
        sourceFiles.length === 0
          ? discoveredFiles === 0
            ? 'No media files found. Saving existing index...'
            : skippedIndexedFiles > 0
              ? `No new or stale media files found (${skippedIndexedFiles} already indexed). Saving existing index...`
              : 'No media files found. Saving existing index...'
          : refreshQueuedFiles > 0 && newQueuedFiles > 0
            ? `Analyzing ${newQueuedFiles} new files and refreshing ${refreshQueuedFiles} indexed files...`
            : refreshQueuedFiles > 0
              ? `Refreshing ${refreshQueuedFiles} indexed files...`
              : skippedIndexedFiles > 0
                ? `Analyzing ${sourceFiles.length} new files (${skippedIndexedFiles} already indexed)...`
                : 'Analyzing new media files...';

      this.mediaScanStore.update(scanId, {
        phase: 'probing',
        currentFile: null,
        processedFiles: 0,
        failedFiles: 0,
        indexedItems: 0,
        skippedIndexedFiles,
        totalFiles: sourceFiles.length,
        message: probingMessage,
      });

      const items: MediaItem[] = [];
      let failedFiles = 0;
      let refreshedIndexedCount = 0;
      let newlyIndexedCount = 0;

      let normalizedTitleByPath = new Map<string, string>();
      const titleNormalizationPaths = sourceFiles
        .filter(
          (sourceFile) =>
            !sourceFile.existingItem ||
            this.looksLikeProvisionalTorrentMetadata(sourceFile.existingItem),
        )
        .map((sourceFile) => sourceFile.filePath);
      if (titleNormalizationPaths.length > 0) {
        this.mediaScanStore.update(scanId, {
          phase: 'probing',
          currentFile: null,
          message: 'Normalizing media names for new or provisional files...',
        });

        normalizedTitleByPath =
          await this.mediaAiMetadataService.normalizeTitlesForPaths(
            titleNormalizationPaths,
            ({ done, total }) => {
              if (total <= 0) {
                return;
              }
              this.mediaScanStore.update(scanId, {
                message: `Normalizing media names (${Math.min(done, total)} of ${total} unique titles)...`,
              });
            },
          );
      }

      for (let index = 0; index < sourceFiles.length; index += 1) {
        const sourceFile = sourceFiles[index];
        this.mediaScanStore.update(scanId, {
          phase: 'probing',
          currentFile: sourceFile.displayPath,
          processedFiles: index,
          message: `Analyzing file ${index + 1} of ${sourceFiles.length}...`,
        });

        try {
          const normalizedTitleHint =
            normalizedTitleByPath.get(sourceFile.filePath) ?? '';
          const item = await this.scanner.probeFile(
            sourceFile.filePath,
            sourceFile.sourcePath,
            normalizedTitleHint
              ? {
                  title: normalizedTitleHint,
                  normalizedTitle: normalizedTitleHint,
                }
              : undefined,
          );

          let indexedItem: MediaItem = {
            ...item,
            relativePath: `${sourceFile.locationLabel}/${item.relativePath}`,
          };

          if (sourceFile.existingItem) {
            indexedItem = this.mergeScannedIndexedItem(
              sourceFile.existingItem,
              indexedItem,
            );
          }

          await this.mediaStore.upsert(indexedItem);
          const stored = await this.mediaStore.findByFilePath(
            indexedItem.filePath,
          );
          items.push(stored ?? indexedItem);

          if (sourceFile.existingItem) {
            refreshedIndexedCount += 1;
          } else {
            newlyIndexedCount += 1;
          }
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
          skippedIndexedFiles,
        });
      }

      const mergedByFilePath = new Map(
        existingItems.map((item) => [this.toFilePathKey(item.filePath), item]),
      );
      for (const item of items) {
        mergedByFilePath.set(this.toFilePathKey(item.filePath), item);
      }

      const { items: deduplicatedItems, duplicatesRemoved } =
        await this.applyDeduplication([...mergedByFilePath.values()]);

      deduplicatedItems.sort((left, right) =>
        left.title.localeCompare(right.title),
      );

      this.mediaScanStore.update(scanId, {
        phase: 'saving',
        currentFile: null,
        message: 'Saving media index...',
      });

      await this.mediaStore.replaceAll(deduplicatedItems);

      const existingRetainedCount = Math.max(
        0,
        deduplicatedItems.length - newlyIndexedCount - refreshedIndexedCount,
      );
      const duplicateMessage =
        duplicatesRemoved > 0
          ? ` (${duplicatesRemoved} duplicates removed).`
          : '.';
      const completionMessage =
        newlyIndexedCount === 0 && refreshedIndexedCount === 0
          ? `Scan complete: no new files found across ${sourcePaths.length} locations; retained ${deduplicatedItems.length} indexed items${duplicateMessage}`
          : newlyIndexedCount > 0 && refreshedIndexedCount > 0
            ? `Scan complete: indexed ${newlyIndexedCount} new files, refreshed ${refreshedIndexedCount} existing items, and retained ${existingRetainedCount} unchanged items across ${sourcePaths.length} locations${duplicateMessage}`
            : newlyIndexedCount > 0
              ? `Scan complete: indexed ${newlyIndexedCount} new files and retained ${existingRetainedCount} existing items across ${sourcePaths.length} locations${duplicateMessage}`
              : `Scan complete: refreshed ${refreshedIndexedCount} existing items and retained ${existingRetainedCount} unchanged items across ${sourcePaths.length} locations${duplicateMessage}`;

      this.mediaScanStore.complete(scanId, {
        totalFiles: sourceFiles.length,
        processedFiles: sourceFiles.length,
        indexedItems: deduplicatedItems.length,
        failedFiles,
        skippedIndexedFiles,
        message: completionMessage,
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

  private shouldRefreshIndexedItem(item: MediaItem): boolean {
    if (this.looksLikeProvisionalTorrentMetadata(item)) {
      return true;
    }

    if (
      !this.hasNonEmptyString(item.previewImagePath) &&
      !this.hasNonEmptyString(item.backdropImagePath)
    ) {
      return true;
    }

    return !this.hasMetadataEnrichment(item);
  }

  private isMetadataRefreshOlderThan(
    item: MediaItem,
    minAgeMs: number,
  ): boolean {
    const refreshedAtMs = Date.parse(
      item.metadataRefreshedAt || item.updatedAt,
    );
    if (!Number.isFinite(refreshedAtMs)) {
      return true;
    }

    return Date.now() - refreshedAtMs >= minAgeMs;
  }

  private hasMetadataEnrichment(item: MediaItem): boolean {
    return (
      item.tags.length > 0 ||
      this.hasNonEmptyString(item.description) ||
      this.hasNonEmptyString(item.previewImagePath) ||
      this.hasNonEmptyString(item.backdropImagePath) ||
      Boolean(item.remoteSource && item.remoteSourceId)
    );
  }

  private looksLikeProvisionalTorrentMetadata(item: MediaItem): boolean {
    const extensionContainer = item.extension.replace(/^\./, '').toLowerCase();
    const container = (item.container ?? '').trim().toLowerCase();
    const formatName = (item.mediaDetails.formatName ?? '')
      .trim()
      .toLowerCase();
    const hasStreamDetails =
      (item.width ?? 0) > 0 ||
      (item.height ?? 0) > 0 ||
      this.hasNonEmptyString(item.videoCodec) ||
      this.hasNonEmptyString(item.audioCodec) ||
      item.subtitleStreams > 0 ||
      item.chapterThumbnails.length > 0;

    if (hasStreamDetails) {
      return false;
    }

    return (
      Boolean(extensionContainer) &&
      container === extensionContainer &&
      (!formatName || formatName === extensionContainer)
    );
  }

  private hasNonEmptyString(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private mergeScannedIndexedItem(
    existing: MediaItem,
    scanned: MediaItem,
  ): MediaItem {
    const merged: MediaItem = {
      ...scanned,
      id: existing.id,
    };

    // Existing indexed metadata is authoritative. Scanner results should
    // refresh technical probe fields and fill missing metadata only.
    merged.title = this.hasNonEmptyString(existing.title)
      ? existing.title
      : scanned.title;
    merged.releaseYear = existing.releaseYear ?? scanned.releaseYear;
    merged.type = existing.type;
    merged.seasonNumber = existing.seasonNumber ?? scanned.seasonNumber;
    merged.episodeNumber = existing.episodeNumber ?? scanned.episodeNumber;
    merged.episodeTitle = this.hasNonEmptyString(existing.episodeTitle)
      ? existing.episodeTitle
      : scanned.episodeTitle;
    merged.tags = existing.tags.length > 0 ? existing.tags : scanned.tags;
    merged.description = this.hasNonEmptyString(existing.description)
      ? existing.description
      : scanned.description;
    merged.previewImagePath = this.hasNonEmptyString(existing.previewImagePath)
      ? existing.previewImagePath
      : scanned.previewImagePath;
    merged.backdropImagePath = this.hasNonEmptyString(
      existing.backdropImagePath,
    )
      ? existing.backdropImagePath
      : scanned.backdropImagePath;

    if (
      !this.hasNonEmptyString(scanned.container) &&
      this.hasNonEmptyString(existing.container)
    ) {
      merged.container = existing.container;
    }

    if (scanned.durationSeconds <= 0 && existing.durationSeconds > 0) {
      merged.durationSeconds = existing.durationSeconds;
    }

    if ((scanned.width ?? 0) <= 0 && (existing.width ?? 0) > 0) {
      merged.width = existing.width;
    }

    if ((scanned.height ?? 0) <= 0 && (existing.height ?? 0) > 0) {
      merged.height = existing.height;
    }

    if (
      !this.hasNonEmptyString(scanned.videoCodec) &&
      this.hasNonEmptyString(existing.videoCodec)
    ) {
      merged.videoCodec = existing.videoCodec;
    }

    if (
      !this.hasNonEmptyString(scanned.audioCodec) &&
      this.hasNonEmptyString(existing.audioCodec)
    ) {
      merged.audioCodec = existing.audioCodec;
    }

    if (
      (!Array.isArray(scanned.subtitleDetails) ||
        scanned.subtitleDetails.length === 0) &&
      Array.isArray(existing.subtitleDetails) &&
      existing.subtitleDetails.length > 0
    ) {
      merged.subtitleDetails = existing.subtitleDetails;
      merged.subtitleStreams = existing.subtitleStreams;
    }

    if (
      (!Array.isArray(scanned.chapterThumbnails) ||
        scanned.chapterThumbnails.length === 0) &&
      Array.isArray(existing.chapterThumbnails) &&
      existing.chapterThumbnails.length > 0
    ) {
      merged.chapterThumbnails = existing.chapterThumbnails;
    }

    merged.mediaDetails = {
      formatName:
        scanned.mediaDetails?.formatName ?? existing.mediaDetails.formatName,
      bitRate: scanned.mediaDetails?.bitRate ?? existing.mediaDetails.bitRate,
      frameRate:
        scanned.mediaDetails?.frameRate ?? existing.mediaDetails.frameRate,
      audioChannels:
        scanned.mediaDetails?.audioChannels ??
        existing.mediaDetails.audioChannels,
    };

    if (scanned.sizeBytes <= 0 && existing.sizeBytes > 0) {
      merged.sizeBytes = existing.sizeBytes;
    }

    if (existing.remoteSource && existing.remoteSourceId) {
      merged.remoteSource = existing.remoteSource;
      merged.remoteSourceId = existing.remoteSourceId;
      merged.remoteSourceLabel =
        existing.remoteSourceLabel ??
        this.remoteSourceLabel(existing.remoteSource);
    } else if (merged.remoteSource && merged.remoteSourceId) {
      merged.remoteSourceLabel = this.remoteSourceLabel(merged.remoteSource);
    } else {
      merged.remoteSource = undefined;
      merged.remoteSourceId = null;
      merged.remoteSourceLabel = null;
    }

    if (existing.seriesAssignmentRules) {
      merged.seriesAssignmentRules = existing.seriesAssignmentRules;
    } else {
      merged.seriesAssignmentRules = null;
    }

    this.reconcileEpisodeCatalogLink(merged, existing, null, false);

    if (merged.type === 'show' && merged.seasonNumber === null) {
      merged.seasonNumber = 1;
    }

    if (merged.type !== 'show') {
      merged.seasonNumber = null;
      merged.episodeNumber = null;
      merged.episodeTitle = null;
    }

    const normalizedTitle = this.hasNonEmptyString(merged.title)
      ? merged.title.trim()
      : scanned.title;
    merged.title = normalizedTitle;
    merged.tags = this.normalizeEditableTags(merged.tags);
    merged.normalizedTitle = normalizeForKey(merged.title);
    merged.dedupeKey = this.buildDedupeKey(merged);

    return merged;
  }

  private async refreshIndexedMediaItem(
    existing: MediaItem,
  ): Promise<MediaItem | null> {
    try {
      const libraryRoot = await this.resolveLibraryRootForFile(
        existing.filePath,
        dirname(existing.filePath),
      );
      const normalizedHint = existing.normalizedTitle?.trim() || '';
      const titleHint = existing.title?.trim() || '';
      const probeHint: MediaProbeHint | undefined =
        titleHint || normalizedHint
          ? {
              title: titleHint || normalizedHint,
              normalizedTitle: normalizedHint || titleHint,
              releaseYear: existing.releaseYear,
              mediaType: existing.type,
            }
          : undefined;

      const scanned = await this.scanner.probeFile(
        existing.filePath,
        libraryRoot,
        probeHint,
      );
      const merged = this.mergeScannedIndexedItem(existing, {
        ...scanned,
        relativePath: existing.relativePath,
      });

      await this.mediaStore.upsert(merged);
      return (await this.mediaStore.findByFilePath(merged.filePath)) ?? merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Automatic metadata refresh skipped for ${existing.filePath}: ${message}`,
      );
      return null;
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

  private toFilePathKey(filePath: string): string {
    const normalized = resolve(filePath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }
}


