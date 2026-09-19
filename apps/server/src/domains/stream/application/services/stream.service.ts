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
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AccountsStore } from '../../../auth/infrastructure/stores/accounts.store';
import {
  MediaService,
  type PlaybackAudioTrack,
} from '../../../media/application/services/media.service';
import { resolveSafePathFromFileName } from '../../../core/infrastructure/shared/safe-path';
import { ProgressivePlaybackSourceRegistry } from '../../../core/application/extensions/progressive-playback-source';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import {
  HlsSession,
  HlsSessionStore,
} from '../../infrastructure/stores/hls-session.store';
import { RangeStreamService } from './range-stream.service';
import { HlsManifestService } from './hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
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
  buildHlsStartKeyValue,
  findReusableSessionValue,
  createSessionValue,
  HlsStartSingleFlight,
  type ReusableHlsSession,
} from './hls-session-lifecycle.helper';
import type { HlsSessionStatsResponse } from './stream.types';
import { resolveTranscodeProfileValue } from './stream-transcode-profile.helper';
import { cleanupOrphanSessionDirsValue } from './stream-orphan-cleanup.helper';
import { PlaybackActivityService } from '../../../lifecycle/application/services/playback-activity.service';
import { HlsTranscodeCapabilityService } from './hls/hls-transcode-capability.service';
import { HlsSessionCleanupService } from './hls/hls-session-cleanup.service';
import { HlsContinuousAudioTranscoder } from './hls/hls-continuous-audio-transcoder.service';

@Injectable()
export class StreamService implements OnModuleInit {
  private readonly logger = new Logger(StreamService.name);
  private readonly hlsRoot = join(process.cwd(), 'data', 'hls');
  // Bumped to invalidate caches from the previous "long-running ffmpeg + EVENT
  // playlist" architecture and to refresh reusable sessions when transcoder
  // argument semantics change.
  private readonly hlsSessionFormatVersion = 14;
  private readonly startSegmentRecoverableWindowMs = 30_000;
  private readonly maxStartSegmentRecoverableFailures = 4;
  private readonly hlsStarts = new HlsStartSingleFlight<ReusableHlsSession>();

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly progressivePlaybackSources: ProgressivePlaybackSourceRegistry,
    private readonly hlsSessionStore: HlsSessionStore,
    private readonly rangeStreamService: RangeStreamService,
    private readonly manifestService: HlsManifestService,
    private readonly segmentTranscoder: HlsSegmentTranscoder,
    private readonly playbackActivity: PlaybackActivityService,
    private readonly transcodeCapability: HlsTranscodeCapabilityService,
    private readonly sessionCleanup: HlsSessionCleanupService,
    private readonly continuousAudioTranscoder: HlsContinuousAudioTranscoder,
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
    this.playbackActivity.assertCanStartPlayback();
    await this.sessionCleanup.prepareForSessionStart();
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
    const ffmpegPath = systemSettings.ffmpegPath || 'ffmpeg';
    const videoEncoder = await this.transcodeCapability.resolveVideoEncoder(
      systemSettings.transcodeHardwareAcceleration,
      ffmpegPath,
    );

    const startKey = buildHlsStartKeyValue(
      mediaId,
      selectedAudioStreamIndex,
      transcodeProfile,
      videoEncoder,
    );
    return this.hlsStarts.run(
      startKey,
      forceFresh,
      async (effectiveForceFresh) => {
        const reusable = await findReusableSessionValue(
          mediaId,
          effectiveForceFresh,
          selectedAudioStreamIndex,
          transcodeProfile,
          Math.max(systemSettings.hlsSegmentSeconds, 1),
          videoEncoder,
          this.hlsSessionStore,
          this.hlsSessionFormatVersion,
          this.segmentTranscoder,
          (sessionId) =>
            this.continuousAudioTranscoder.cancelForSession(sessionId),
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
          this.progressivePlaybackSources,
          this.logger,
          {
            ffmpegPath: systemSettings.ffmpegPath,
            hlsSegmentSeconds: systemSettings.hlsSegmentSeconds,
            transcodePreset: systemSettings.transcodePreset,
            transcodeCrf: systemSettings.transcodeCrf,
            transcodeRateControlBufferSeconds:
              systemSettings.transcodeRateControlBufferSeconds,
            videoEncoder,
          },
          transcodeProfile,
        );
        await this.prepareSessionManifests(session);
        this.hlsSessionStore.set(session);

        this.logger.log(
          `HLS session ${session.sessionId} ready (${session.totalSegments} segments, ${session.totalDurationSeconds.toFixed(1)}s, ${session.videoEncoder} encoder, on-demand transcode)`,
        );

        return {
          sessionId: session.sessionId,
          manifestUrl: `/api/stream/hls/${session.sessionId}/master.m3u8`,
          totalDurationSeconds: session.totalDurationSeconds,
          selectedAudioStreamIndex: session.selectedAudioStreamIndex,
          maxVideoBitrateKbps: session.maxVideoBitrateKbps,
          audioBitrateKbps: session.audioBitrateKbps,
          maxOutputHeight: session.maxOutputHeight,
        };
      },
    );
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
    const queueLimits = this.segmentTranscoder.getQueueLimits();

    return {
      sessionId: session.sessionId,
      mediaId: session.mediaId,
      startedAt: session.startedAt,
      ffmpegPath: session.ffmpegPath,
      videoEncoder: session.videoEncoder,
      sourceFilePath: session.sourceFilePath,
      segmentSeconds: session.segmentSeconds,
      totalDurationSeconds: session.totalDurationSeconds,
      totalSegments: session.totalSegments,
      selectedAudioStreamIndex: session.selectedAudioStreamIndex,
      maxVideoBitrateKbps: session.maxVideoBitrateKbps,
      audioBitrateKbps: session.audioBitrateKbps,
      maxOutputHeight: session.maxOutputHeight,
      keyFrameInterval: session.keyFrameInterval,
      progressiveSourceId: session.progressiveSource?.sourceId ?? null,
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
      globalInflightCount: this.segmentTranscoder.getInflightCount(),
      cpuInflightCount: this.segmentTranscoder.getCpuInflightCount(),
      maxGlobalInflightJobs: queueLimits.maxGlobalInflightJobs,
      maxSessionInflightJobs: queueLimits.maxSessionInflightJobs,
      maxCpuInflightJobs: queueLimits.maxCpuInflightJobs,
      overloadRetryAfterSeconds: queueLimits.overloadRetryAfterSeconds,
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
    manifestTransform?: (manifest: string) => string,
  ) {
    const playbackKey = `hls:${sessionId}`;
    this.playbackActivity.assertCanContinuePlayback(playbackKey);
    this.playbackActivity.trackResponse(playbackKey, response);
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
      this.serveManifest(fullPath, response, accessToken, manifestTransform);
      return;
    }

    if (this.isContinuousAudioSegment(fileName)) {
      this.serveContinuousAudioSegment(fullPath, response);
      return;
    }

    if (fileName.endsWith('.ts')) {
      await this.serveSegment(session, fileName, fullPath, response);
      return;
    }

    this.serveStaticFile(fullPath, response);
  }

  async streamHlsCompatibilitySegment(
    sessionId: string,
    fileName: string,
    response: Response,
  ): Promise<void> {
    if (!/^segment_\d{5}\.ts$/.test(fileName)) {
      throw new BadRequestException('Invalid compatibility segment name.');
    }

    const playbackKey = `hls:${sessionId}`;
    this.playbackActivity.assertCanContinuePlayback(playbackKey);
    this.playbackActivity.trackResponse(playbackKey, response);
    const session = this.hlsSessionStore.get(sessionId);
    if (!session) {
      throw new NotFoundException('HLS session not found.');
    }

    const outputDir = join(session.outputDir, 'direct-muxed');
    await mkdir(outputDir, { recursive: true });
    const fullPath = resolveSafePathFromFileName({
      basePath: outputDir,
      fileName,
      invalidFileNameMessage: 'Invalid file name.',
      invalidPathMessage: 'Invalid path.',
    });
    const compatibilitySession: HlsSession = {
      ...session,
      sessionId: `${session.sessionId}:direct-muxed`,
      outputDir,
    };

    await serveHlsSegmentValue({
      session: compatibilitySession,
      fileName,
      fullPath,
      response,
      logger: this.logger,
      progressivePlaybackSources: this.progressivePlaybackSources,
      segmentTranscoder: this.segmentTranscoder,
      startSegmentRecoverableWindowMs: this.startSegmentRecoverableWindowMs,
      maxStartSegmentRecoverableFailures:
        this.maxStartSegmentRecoverableFailures,
      forceMuxedAudio: true,
      resolveReachableSourcePath: this.resolveReachableSourcePath.bind(this),
    });
  }

  async streamDirect(mediaId: string, request: Request, response: Response) {
    const playbackKey = `direct:${mediaId}`;
    this.playbackActivity.assertCanContinuePlayback(playbackKey);
    this.playbackActivity.trackResponse(playbackKey, response);
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
    manifestTransform?: (manifest: string) => string,
  ) {
    if (!existsSync(fullPath)) {
      throw new NotFoundException('HLS manifest not ready.');
    }

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');

    if (accessToken || manifestTransform) {
      let manifestContent = readFileSync(fullPath, 'utf8');
      if (accessToken) {
        manifestContent = this.manifestService.rewriteWithAccessToken(
          manifestContent,
          accessToken,
        );
      }
      if (manifestTransform) {
        manifestContent = manifestTransform(manifestContent);
      }
      response.send(manifestContent);
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
      progressivePlaybackSources: this.progressivePlaybackSources,
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

  private async prepareSessionManifests(session: HlsSession): Promise<void> {
    if (!session.progressiveSource?.mayBePartial) {
      try {
        const audioManifestFileName =
          session.mediaKind === 'video' ? 'audio.m3u8' : 'master.m3u8';
        await this.continuousAudioTranscoder.start({
          sessionId: session.sessionId,
          ffmpegPath: session.ffmpegPath,
          sourceFilePath: session.sourceFilePath,
          outputDir: session.outputDir,
          manifestFileName: audioManifestFileName,
          audioMapSpecifier: session.audioMapSpecifier,
          audioArgs: session.audioArgs,
          segmentSeconds: session.segmentSeconds,
        });
        session.continuousAudio = true;
        if (session.mediaKind === 'video') {
          const videoManifestPath = join(session.outputDir, 'video.m3u8');
          await this.manifestService.writeVodManifest({
            manifestPath: videoManifestPath,
            segmentSeconds: session.segmentSeconds,
            totalDurationSeconds: session.totalDurationSeconds,
          });
          await this.manifestService.writeMasterManifest({
            manifestPath: session.manifestPath,
            videoManifestFileName: 'video.m3u8',
            audioManifestFileName,
            bandwidthBitsPerSecond:
              (session.maxVideoBitrateKbps + session.audioBitrateKbps) * 1000,
          });
        }
        return;
      } catch (error) {
        this.logger.warn(
          `Continuous audio unavailable for session ${session.sessionId}; using muxed segment audio. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    session.continuousAudio = false;
    await this.manifestService.writeVodManifest({
      manifestPath: session.manifestPath,
      segmentSeconds: session.segmentSeconds,
      totalDurationSeconds: session.totalDurationSeconds,
    });
  }

  private isContinuousAudioSegment(fileName: string): boolean {
    return /^audio_\d{5}\.ts$/.test(fileName);
  }

  private serveContinuousAudioSegment(
    fullPath: string,
    response: Response,
  ): void {
    if (!existsSync(fullPath)) {
      response.setHeader('Cache-Control', 'no-store');
      throw new NotFoundException('Audio segment not ready.');
    }
    response.setHeader('Content-Type', 'video/mp2t');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
