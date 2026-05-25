import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountsStore } from '../../../auth/infrastructure/stores/accounts.store';
import {
  MediaService,
  type PlaybackAudioTrack,
} from '../../../media/application/services/media.service';
import { resolveSafePathFromFileName } from '../../../core/infrastructure/shared/safe-path';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { TorrentMediaIndexStore } from '../../../torrent/infrastructure/stores/torrent-media-index.store';
import { TorrentService } from '../../../torrent/application/services/torrent.service';
import {
  HlsSession,
  HlsSessionStore,
} from '../../infrastructure/stores/hls-session.store';
import { RangeStreamService } from './range-stream.service';
import { HlsManifestService } from './hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import { TorrentDataAvailabilityService } from './hls/torrent-data-availability.service';
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
import { serveHlsSegmentValue } from './stream-hls-segment.helper';
import {
  findReusableSessionValue,
  createSessionValue,
} from './hls-session-lifecycle.helper';
import type { HlsSessionStatsResponse } from './stream.types';
import { resolveTranscodeProfileValue } from './stream-transcode-profile.helper';
import { cleanupOrphanSessionDirsValue } from './stream-orphan-cleanup.helper';

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
    const transcodeProfile = resolveTranscodeProfileValue({
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

  // Resolve canonical media path with !qB fallback and non-blocking filesystem checks.
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
    const knownSessionIds = new Set(
      this.hlsSessionStore.all().map((session) => session.sessionId),
    );

    await cleanupOrphanSessionDirsValue({
      hlsRoot: this.hlsRoot,
      knownSessionIds,
      logger: this.logger,
    });
  }
}
