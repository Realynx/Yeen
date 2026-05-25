import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  TorrentService,
  type TorrentFileHint,
} from '../../../../torrent/application/services/torrent.service';
import { TorrentMediaIndexStore } from '../../../../torrent/infrastructure/stores/torrent-media-index.store';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaLocationsStore } from '../../../infrastructure/stores/media-locations.store';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaScannerService } from '../scanner/media-scanner.service';
import { MediaPathResolverService } from '../path-resolution/media-path-resolver.service';
import {
  isRecoverableTorrentProbeErrorValue,
  readFileHeaderValue,
  scoreMediaHeaderValue,
} from './media-header-probe.helpers';
import { buildProvisionalTorrentMediaItemValue } from './provisional-media-builder.helpers';
import {
  discoverTorrentFileByWalkValue,
  mergeTorrentFileHintsValue,
  rankTorrentVideoCandidatesValue,
} from './torrent-file-discovery.helpers';
import {
  collectTorrentSearchRootsValue,
  fileExistsValue,
} from './torrent-file-path.helpers';
import {
  indexTorrentFileValue,
  type MediaTorrentIndexingContext,
} from './media-torrent-indexing-orchestrator.helper';

@Injectable()
export class MediaTorrentIndexingService {
  private readonly logger = new Logger(MediaTorrentIndexingService.name);
  private readonly torrentUnavailableReason =
    'qBittorrent is temporarily unreachable. Retrying automatically...';
  private readonly lastHeadGateLogAtMsByHash = new Map<string, number>();
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
    return indexTorrentFileValue(this.context(), hash);
  }

  private context(): MediaTorrentIndexingContext {
    return {
      torrentUnavailableReason: this.torrentUnavailableReason,
      logger: this.logger,
      mediaStore: this.mediaStore,
      torrentMediaIndexStore: this.torrentMediaIndexStore,
      torrentService: this.torrentService,
      mediaPathResolver: this.mediaPathResolver,
      scanner: this.scanner,
      fileExists: (filePath) => fileExistsValue(filePath),
      tryTorrentRead: (hash, phase, read) =>
        this.tryTorrentRead(hash, phase, read),
      mergeTorrentFileHints: (
        qbFiles: Array<{ name: string; size: number }>,
        hintedFiles: TorrentFileHint[],
      ) => mergeTorrentFileHintsValue(qbFiles, hintedFiles),
      rankTorrentVideoCandidates: (files) =>
        rankTorrentVideoCandidatesValue(files),
      findIndexedMediaByFilePathCandidates: (absoluteFileCandidates) =>
        this.findIndexedMediaByFilePathCandidates(absoluteFileCandidates),
      findAllocatedTorrentFileCandidate: (absoluteFileCandidates) =>
        this.findAllocatedTorrentFileCandidate(absoluteFileCandidates),
      shouldAttemptFallbackWalk: (hash, minIntervalMs) =>
        this.shouldAttemptFallbackWalk(hash, minIntervalMs),
      collectTorrentSearchRoots: (input) =>
        collectTorrentSearchRootsValue(input),
      discoverTorrentFileByWalk: (searchRoots, expectedBasename) =>
        discoverTorrentFileByWalkValue(
          searchRoots,
          expectedBasename,
          this.logger,
        ),
      resolveLibraryRootForFile: (absoluteFilePath, fallbackRoot) =>
        this.resolveLibraryRootForFile(absoluteFilePath, fallbackRoot),
      buildProvisionalTorrentMediaItem: (input) =>
        buildProvisionalTorrentMediaItemValue(input),
      readFileHeader: (filePath, byteCount) =>
        readFileHeaderValue(filePath, byteCount),
      scoreMediaHeader: (header, fileSize) =>
        scoreMediaHeaderValue(header, fileSize),
      logHeadGateDiagnostic: (input) => this.logHeadGateDiagnostic(input),
      isRecoverableTorrentProbeError: (message) =>
        isRecoverableTorrentProbeErrorValue(message),
      rememberTorrentMediaMapping: (hash, media) =>
        this.rememberTorrentMediaMapping(hash, media),
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

  private async tryTorrentRead<T>(
    hash: string,
    phase: 'paths' | 'files',
    read: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof GatewayTimeoutException
      ) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `qBittorrent unreachable during torrent index poll (${phase}). hash=${hash}: ${message}`,
        );
        return null;
      }

      throw error;
    }
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
    canonicalPath: string;
    probePath: string;
    fileStats: Stats;
  } | null> {
    const allocated: Array<{
      canonicalPath: string;
      probePath: string;
      fileStats: Stats;
    }> = [];

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
        // canonical path doesn't exist
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
        // in-progress variant doesn't exist
      }
    }

    if (allocated.length === 0) {
      return null;
    }

    if (allocated.length === 1) {
      return allocated[0];
    }

    let best: {
      canonicalPath: string;
      probePath: string;
      fileStats: Stats;
    } | null = null;
    let bestScore = -1;

    for (const candidate of allocated) {
      const header = await readFileHeaderValue(candidate.probePath, 16);
      const score = scoreMediaHeaderValue(header, candidate.fileStats.size);
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
      `Head-byte gate blocked hash=${hash} path=${probePath} bytes=${hex} score=${headerScore} statSize=${fileSize} ${qbInfo}`,
    );
  }

  private async resolveLibraryRootForFile(
    absoluteFilePath: string,
    fallbackRoot: string,
  ): Promise<string> {
    const configured = await this.mediaLocationsStore.all();
    const normalizedFile = resolve(absoluteFilePath);

    for (const rawLocation of configured) {
      const resolvedLocation = resolve(rawLocation);
      const rel = relative(resolvedLocation, normalizedFile);
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        return resolvedLocation;
      }
    }

    return resolve(fallbackRoot);
  }
}
