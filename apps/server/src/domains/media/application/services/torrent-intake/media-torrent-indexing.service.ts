import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  readMediaFileHeader,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../../core/infrastructure/shared/media-header-probe';
import {
  TorrentService,
  type TorrentFileHint,
} from '../../../../torrent/application/services/torrent.service';
import { TorrentMediaIndexStore } from '../../../../torrent/infrastructure/stores/torrent-media-index.store';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { detectFromFilenameAndPath } from '../../../infrastructure/helpers/filename-metadata';
import {
  cleanTitle,
  normalizeForKey,
} from '../../../infrastructure/helpers/title-normalizer';
import { MediaLocationsStore } from '../../../infrastructure/stores/media-locations.store';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import {
  MediaScannerService,
  type MediaProbeHint,
} from '../scanner/media-scanner.service';
import { MediaPathResolverService } from '../path-resolution/media-path-resolver.service';

@Injectable()
export class MediaTorrentIndexingService {
  private readonly logger = new Logger(MediaTorrentIndexingService.name);
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

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly scanner: MediaScannerService,
    private readonly mediaPathResolver: MediaPathResolverService,
    private readonly torrentService: TorrentService,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
  ) {}

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

}

