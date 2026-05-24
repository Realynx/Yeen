import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AccountsStore } from '../../../auth/infrastructure/stores/accounts.store';
import {
  MediaService,
  type PlaybackAudioTrack,
} from '../../../media/application/services/media.service';
import { resolveSafePathFromFileName } from '../../../core/infrastructure/shared/safe-path';
import {
  readMediaFileHeader,
  readMediaFileHeaderCached,
  readMediaFileHeaderUnbuffered,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../core/infrastructure/shared/media-header-probe';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { TorrentMediaIndexStore } from '../../../torrent/infrastructure/stores/torrent-media-index.store';
import { TorrentService } from '../../../torrent/application/services/torrent.service';
import {
  HlsSession,
  HlsSessionStore,
} from '../../infrastructure/stores/hls-session.store';
import { RangeStreamService } from './range-stream.service';
import {
  buildAudioEncoderArgs,
  buildVideoEncoderArgs,
  computeKeyFrameInterval,
} from '../../infrastructure/hls/hls-ffmpeg-args';
import { HlsManifestService } from './hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import { TorrentDataAvailabilityService } from './hls/torrent-data-availability.service';
import { totalSegmentCount } from '../../infrastructure/hls/hls-segment-naming';
import {
  normalizeAudioStreamIndexValue,
  resolveRequestedAudioStreamIndexValue,
} from './audio-stream-resolver.helper';
import {
  resolveActualFilePathValue,
  SourceUnreachableError,
} from './media-file-resolver.helper';
import {
  listReadySegmentIndicesValue,
  computeContiguousReadySegmentsValue,
} from './hls-segment-stats.helper';
import {
  getSegment0ProxyPathValue,
  buildSegment0HeadProxyValue,
  resetStartSegmentArtifactsValue,
} from './start-segment-recovery.helper';
import { serveHlsSegmentValue } from './stream-hls-segment.helper';
import {
  findReusableSessionValue,
  createSessionValue,
  discardSessionValue,
  type ResolvedTranscodeProfile,
} from './hls-session-lifecycle.helper';

export interface HlsSessionStatsResponse {
  sessionId: string;
  mediaId: string;
  startedAt: string;
  ffmpegPath: string;
  sourceFilePath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
  keyFrameInterval: number;
  torrentHash: string | null;
  readySegments: number;
  contiguousReadySegments: number;
  readyThroughSeconds: number;
  readyPercent: number;
  highestReadySegment: number | null;
  inflightSegments: number[];
  inflightCount: number;
  nextSegmentIndex: number | null;
  recoverableStartFailures: number;
}

@Injectable()
export class StreamService implements OnModuleInit {
  private readonly logger = new Logger(StreamService.name);
  private readonly hlsRoot = join(process.cwd(), 'data', 'hls');
  // Bumped to invalidate caches from the previous "long-running ffmpeg + EVENT
  // playlist" architecture and to refresh reusable sessions when transcoder
  // argument semantics change.
  private readonly hlsSessionFormatVersion = 10;
  private readonly startSegmentRecoverableWindowMs = 30_000;
  private readonly maxStartSegmentRecoverableFailures = 4;

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly torrentService: TorrentService,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
    private readonly hlsSessionStore: HlsSessionStore,
    private readonly rangeStreamService: RangeStreamService,
    private readonly manifestService: HlsManifestService,
    private readonly segmentTranscoder: HlsSegmentTranscoder,
    private readonly availability: TorrentDataAvailabilityService,
  ) {}

  async onModuleInit() {
    await this.cleanupOrphanSessionDirs();
  }

  async startHls(
    mediaId: string,
    options?: {
      forceFresh?: boolean;
      audioStreamIndex?: number | null;
      maxVideoBitrateKbps?: number | null;
      audioBitrateKbps?: number | null;
      maxOutputHeight?: number | null;
      accountId?: string;
    },
  ) {
    const forceFresh = Boolean(options?.forceFresh);
    const requestedAudioStreamIndex = normalizeAudioStreamIndexValue(
      options?.audioStreamIndex,
    );
    const audioTracks = await this.mediaService.getPlaybackAudioTracks(mediaId);
    const selectedAudioStreamIndex = resolveRequestedAudioStreamIndexValue(
      requestedAudioStreamIndex,
      audioTracks,
    );
    const accountMaxBitrateKbps = await this.resolveAccountMaxBitrateKbps(
      options?.accountId,
    );
    const systemSettings = await this.systemSettingsService.getSettings();
    const transcodeProfile = this.resolveTranscodeProfile({
      accountMaxBitrateKbps,
      systemDefaultVideoBitrateKbps:
        systemSettings.transcodeDefaultMaxBitrateKbps,
      systemDefaultAudioBitrateKbps: systemSettings.transcodeAudioBitrateKbps,
      systemDefaultMaxOutputHeight: systemSettings.transcodeMaxOutputHeight,
      requestedMaxVideoBitrateKbps: options?.maxVideoBitrateKbps,
      requestedAudioBitrateKbps: options?.audioBitrateKbps,
      requestedMaxOutputHeight: options?.maxOutputHeight,
    });

    const reusable = findReusableSessionValue(
      mediaId,
      forceFresh,
      selectedAudioStreamIndex,
      transcodeProfile,
      this.hlsSessionStore,
      this.hlsSessionFormatVersion,
      this.segmentTranscoder,
    );
    if (reusable) {
      return reusable;
    }

    const session = await createSessionValue(
      mediaId,
      selectedAudioStreamIndex,
      this.hlsRoot,
      this.hlsSessionFormatVersion,
      this.mediaService,
      this.torrentMediaIndexStore,
      this.logger,
      {
        ffmpegPath: systemSettings.ffmpegPath,
        hlsSegmentSeconds: systemSettings.hlsSegmentSeconds,
        transcodePreset: systemSettings.transcodePreset,
        transcodeCrf: systemSettings.transcodeCrf,
        transcodeRateControlBufferSeconds:
          systemSettings.transcodeRateControlBufferSeconds,
      },
      transcodeProfile,
    );
    await this.manifestService.writeVodManifest({
      manifestPath: session.manifestPath,
      segmentSeconds: session.segmentSeconds,
      totalDurationSeconds: session.totalDurationSeconds,
    });

    this.hlsSessionStore.set(session);

    this.logger.log(
      `HLS session ${session.sessionId} ready (${session.totalSegments} segments, ${session.totalDurationSeconds.toFixed(1)}s, on-demand transcode)`,
    );

    return {
      sessionId: session.sessionId,
      manifestUrl: `/api/stream/hls/${session.sessionId}/master.m3u8`,
      selectedAudioStreamIndex: session.selectedAudioStreamIndex,
      maxVideoBitrateKbps: session.maxVideoBitrateKbps,
      audioBitrateKbps: session.audioBitrateKbps,
      maxOutputHeight: session.maxOutputHeight,
    };
  }

  async listAudioTracks(
    mediaId: string,
  ): Promise<{ tracks: PlaybackAudioTrack[] }> {
    const tracks = await this.mediaService.getPlaybackAudioTracks(mediaId);
    return { tracks };
  }

  async getHlsSessionStats(
    sessionId: string,
  ): Promise<HlsSessionStatsResponse> {
    const session = this.hlsSessionStore.get(sessionId);
    if (!session) {
      throw new NotFoundException('HLS session not found.');
    }

    const readySegmentIndices = await listReadySegmentIndicesValue(
      session.outputDir,
    );
    const readySegments = readySegmentIndices.length;
    const highestReadySegment =
      readySegmentIndices.length > 0
        ? readySegmentIndices[readySegmentIndices.length - 1]
        : null;
    const contiguousReadySegments = computeContiguousReadySegmentsValue(
      readySegmentIndices,
      session.totalSegments,
    );
    const readyThroughSeconds =
      contiguousReadySegments >= session.totalSegments
        ? session.totalDurationSeconds
        : Math.min(
            session.totalDurationSeconds,
            contiguousReadySegments * session.segmentSeconds,
          );
    const inflightSegments = this.segmentTranscoder.getInflightSegmentIndices(
      session.sessionId,
    );

    return {
      sessionId: session.sessionId,
      mediaId: session.mediaId,
      startedAt: session.startedAt,
      ffmpegPath: session.ffmpegPath,
      sourceFilePath: session.sourceFilePath,
      segmentSeconds: session.segmentSeconds,
      totalDurationSeconds: session.totalDurationSeconds,
      totalSegments: session.totalSegments,
      selectedAudioStreamIndex: session.selectedAudioStreamIndex,
      maxVideoBitrateKbps: session.maxVideoBitrateKbps,
      audioBitrateKbps: session.audioBitrateKbps,
      maxOutputHeight: session.maxOutputHeight,
      keyFrameInterval: session.keyFrameInterval,
      torrentHash: session.torrentHash,
      readySegments,
      contiguousReadySegments,
      readyThroughSeconds,
      readyPercent:
        session.totalSegments > 0
          ? Math.min(100, (readySegments / session.totalSegments) * 100)
          : 0,
      highestReadySegment,
      inflightSegments,
      inflightCount: inflightSegments.length,
      nextSegmentIndex:
        contiguousReadySegments < session.totalSegments
          ? contiguousReadySegments
          : null,
      recoverableStartFailures: session.startSegmentRecoverableFailures ?? 0,
    };
  }

  async streamHlsFile(
    sessionId: string,
    fileName: string,
    response: Response,
    accessToken?: string,
  ) {
    const session = this.hlsSessionStore.get(sessionId);
    if (!session) {
      throw new NotFoundException('HLS session not found.');
    }

    const fullPath = resolveSafePathFromFileName({
      basePath: session.outputDir,
      fileName,
      invalidFileNameMessage: 'Invalid file name.',
      invalidPathMessage: 'Invalid path.',
    });

    if (fileName.endsWith('.m3u8')) {
      this.serveManifest(fullPath, response, accessToken);
      return;
    }

    if (fileName.endsWith('.ts')) {
      await this.serveSegment(session, fileName, fullPath, response);
      return;
    }

    this.serveStaticFile(fullPath, response);
  }

  async streamDirect(mediaId: string, request: Request, response: Response) {
    const media = await this.mediaService.getById(mediaId);
    const canonicalFilePath = await this.mediaService
      .resolveMediaFilePath(media.filePath, media.relativePath)
      .catch(() => media.filePath);
    const filePath = await this.resolveReachableSourcePath(
      canonicalFilePath,
      response,
      'Direct stream',
    );
    await this.rangeStreamService.streamFile(filePath, request, response);
  }

  /**
   * Resolves the actual on-disk path for a media file. qBittorrent renames
   * downloading files to <name>.!qB, so we fall back to that variant when the
   * canonical path doesn't exist yet.
   *
   * Uses async `access` (libuv threadpool) with a short per-candidate timeout
   * so that an unresponsive media volume (e.g. an SMB share whose handles are
   * held by a stalled ffmpeg transcode) cannot block the Node event loop.
   * `existsSync` here previously froze the whole Nest process, which made
   * unrelated requests like `/api/auth/me` hang after a failed stream.
   */
  private async resolveActualFilePath(canonicalPath: string): Promise<string> {
    return resolveActualFilePathValue(canonicalPath, 5_000, this.logger);
  }

  private async resolveAccountMaxBitrateKbps(
    accountId: string | undefined,
  ): Promise<number | null> {
    const normalizedAccountId = accountId?.trim();
    if (!normalizedAccountId) {
      return null;
    }

    const account = await this.accountsStore.findById(normalizedAccountId);
    return account?.maxBitrateKbps ?? null;
  }

  private resolveTranscodeProfile(input: {
    accountMaxBitrateKbps: number | null;
    systemDefaultVideoBitrateKbps: number;
    systemDefaultAudioBitrateKbps: number;
    systemDefaultMaxOutputHeight: number;
    requestedMaxVideoBitrateKbps?: number | null;
    requestedAudioBitrateKbps?: number | null;
    requestedMaxOutputHeight?: number | null;
  }): ResolvedTranscodeProfile {
    const videoBitrateCeilingKbps = this.clampInteger(
      input.accountMaxBitrateKbps ?? input.systemDefaultVideoBitrateKbps,
      250,
      50000,
    );

    const maxVideoBitrateKbps = this.clampInteger(
      input.requestedMaxVideoBitrateKbps ?? videoBitrateCeilingKbps,
      250,
      videoBitrateCeilingKbps,
    );

    const audioBitrateKbps = this.clampInteger(
      input.requestedAudioBitrateKbps ?? input.systemDefaultAudioBitrateKbps,
      48,
      384,
    );

    const maxOutputHeightCeiling = this.clampInteger(
      input.systemDefaultMaxOutputHeight,
      240,
      2160,
    );

    const maxOutputHeight = this.clampInteger(
      input.requestedMaxOutputHeight ?? maxOutputHeightCeiling,
      240,
      maxOutputHeightCeiling,
    );

    return {
      maxVideoBitrateKbps,
      audioBitrateKbps,
      maxOutputHeight,
    };
  }

  private clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, Math.round(value)));
  }

  private async resolveReachableSourcePath(
    canonicalPath: string,
    response: Response,
    context: string,
  ): Promise<string> {
    try {
      return await this.resolveActualFilePath(canonicalPath);
    } catch (error) {
      if (error instanceof SourceUnreachableError) {
        this.logger.warn(`${context} blocked: ${error.message}`);
        response.setHeader('Cache-Control', 'no-store');
        throw new HttpException(
          'Media source is unreachable; check that the storage share is online.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      throw error;
    }
  }

  // -- response serving ------------------------------------------------------

  private serveManifest(
    fullPath: string,
    response: Response,
    accessToken?: string,
  ) {
    if (!existsSync(fullPath)) {
      throw new NotFoundException('HLS manifest not ready.');
    }

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');

    if (accessToken) {
      const manifestContent = readFileSync(fullPath, 'utf8');
      response.send(
        this.manifestService.rewriteWithAccessToken(
          manifestContent,
          accessToken,
        ),
      );
      return;
    }

    createReadStream(fullPath).pipe(response);
  }

  private async serveSegment(
    session: HlsSession,
    fileName: string,
    fullPath: string,
    response: Response,
  ) {
    await serveHlsSegmentValue({
      session,
      fileName,
      fullPath,
      response,
      logger: this.logger,
      torrentService: this.torrentService,
      availability: this.availability,
      segmentTranscoder: this.segmentTranscoder,
      startSegmentRecoverableWindowMs: this.startSegmentRecoverableWindowMs,
      maxStartSegmentRecoverableFailures:
        this.maxStartSegmentRecoverableFailures,
      resolveReachableSourcePath: this.resolveReachableSourcePath.bind(this),
    });
  }

  // Catch-all for any auxiliary file that may live alongside the manifest
  // (currently none, but kept for forward compatibility with init segments).
  private serveStaticFile(fullPath: string, response: Response) {
    if (!existsSync(fullPath)) {
      throw new NotFoundException('HLS file not ready.');
    }
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    createReadStream(fullPath).pipe(response);
  }

  // -- orphan cleanup --------------------------------------------------------

  private async cleanupOrphanSessionDirs() {
    if (!existsSync(this.hlsRoot)) {
      return;
    }
    try {
      const entries = await readdir(this.hlsRoot, { withFileTypes: true });
      const knownSessionIds = new Set(
        this.hlsSessionStore.all().map((session) => session.sessionId),
      );

      await Promise.all(
        entries
          .filter(
            (entry) => entry.isDirectory() && !knownSessionIds.has(entry.name),
          )
          .map(async (entry) => {
            const dirPath = join(this.hlsRoot, entry.name);
            try {
              await rm(dirPath, { recursive: true, force: true });
            } catch (error) {
              this.logger.warn(
                `Failed to remove orphan HLS session dir ${entry.name}: ${(error as Error).message}`,
              );
            }
          }),
      );
    } catch (error) {
      this.logger.warn(
        `HLS orphan cleanup failed: ${(error as Error).message}`,
      );
    }
  }
}
