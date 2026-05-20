import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MediaService } from '../media/media.service';
import { resolveSafePathFromFileName } from '../shared/safe-path';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { HlsSession, HlsSessionStore } from './hls-session.store';
import { RangeStreamService } from './range-stream.service';
import {
  buildAudioEncoderArgs,
  buildVideoEncoderArgs,
  computeKeyFrameInterval,
} from './hls/hls-ffmpeg-args';
import { HlsManifestService } from './hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import {
  computeSegmentTiming,
  parseSegmentIndex,
  segmentFileName,
  totalSegmentCount,
} from './hls/hls-segment-naming';

@Injectable()
export class StreamService implements OnModuleInit {
  private readonly logger = new Logger(StreamService.name);
  private readonly hlsRoot = join(process.cwd(), 'data', 'hls');
  // Bumped to invalidate caches from the previous "long-running ffmpeg + EVENT
  // playlist" architecture. The current pipeline pre-writes a VOD manifest and
  // transcodes each segment on demand the first time it's requested.
  private readonly hlsSessionFormatVersion = 7;

  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly hlsSessionStore: HlsSessionStore,
    private readonly rangeStreamService: RangeStreamService,
    private readonly manifestService: HlsManifestService,
    private readonly segmentTranscoder: HlsSegmentTranscoder,
  ) {}

  async onModuleInit() {
    await this.cleanupOrphanSessionDirs();
  }

  async startHls(mediaId: string, options?: { forceFresh?: boolean }) {
    const forceFresh = Boolean(options?.forceFresh);
    const reusable = this.findReusableSession(mediaId, forceFresh);
    if (reusable) {
      return reusable;
    }

    const session = await this.createSession(mediaId);
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
    await this.rangeStreamService.streamFile(media.filePath, request, response);
  }

  // -- session lifecycle -----------------------------------------------------

  private findReusableSession(mediaId: string, forceFresh: boolean) {
    const existing = this.hlsSessionStore.findReusableByMediaId(mediaId);
    if (!existing) {
      return null;
    }

    if (forceFresh || existing.formatVersion !== this.hlsSessionFormatVersion) {
      this.discardSession(existing.sessionId);
      return null;
    }

    return {
      sessionId: existing.sessionId,
      manifestUrl: `/api/stream/hls/${existing.sessionId}/master.m3u8`,
    };
  }

  private async createSession(mediaId: string): Promise<HlsSession> {
    const media = await this.mediaService.getById(mediaId);

    if (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
      throw new InternalServerErrorException(
        'Media has no known duration; cannot build HLS playlist.',
      );
    }

    const systemSettings = await this.systemSettingsService.getSettings();
    const ffmpegPath = systemSettings.ffmpegPath || 'ffmpeg';
    const segmentSeconds = Math.max(systemSettings.hlsSegmentSeconds, 1);
    const keyFrameInterval = computeKeyFrameInterval(
      media.mediaDetails.frameRate,
      segmentSeconds,
    );

    const sessionId = randomUUID();
    const outputDir = join(this.hlsRoot, sessionId);
    const manifestPath = join(outputDir, 'master.m3u8');

    await mkdir(outputDir, { recursive: true });

    const videoArgs = buildVideoEncoderArgs({
      keyFrameInterval,
      preset: systemSettings.transcodePreset,
      crf: systemSettings.transcodeCrf,
    });
    const audioArgs = buildAudioEncoderArgs();

    const totalDurationSeconds = media.durationSeconds;
    const totalSegments = totalSegmentCount(
      totalDurationSeconds,
      segmentSeconds,
    );

    return {
      sessionId,
      mediaId,
      outputDir,
      manifestPath,
      startedAt: new Date().toISOString(),
      formatVersion: this.hlsSessionFormatVersion,
      sourceFilePath: media.filePath,
      ffmpegPath,
      segmentSeconds,
      totalDurationSeconds,
      totalSegments,
      videoArgs,
      audioArgs,
      keyFrameInterval,
    };
  }

  private discardSession(sessionId: string) {
    const session = this.hlsSessionStore.get(sessionId);
    if (!session) {
      return;
    }

    this.segmentTranscoder.cancelForSession(sessionId);
    this.hlsSessionStore.delete(sessionId);
    void rm(session.outputDir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup
    });
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
        this.manifestService.rewriteWithAccessToken(manifestContent, accessToken),
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
    const segmentIndex = parseSegmentIndex(fileName);
    if (
      segmentIndex === null ||
      segmentIndex < 0 ||
      segmentIndex >= session.totalSegments
    ) {
      throw new NotFoundException('Segment out of range.');
    }

    const timing = computeSegmentTiming(
      segmentIndex,
      session.segmentSeconds,
      session.totalDurationSeconds,
      session.totalSegments,
    );

    try {
      await this.segmentTranscoder.ensureSegment({
        sessionId: session.sessionId,
        segmentIndex,
        segmentPath: fullPath,
        ffmpegPath: session.ffmpegPath,
        sourceFilePath: session.sourceFilePath,
        startSeconds: timing.startSeconds,
        durationSeconds: timing.durationSeconds,
        videoArgs: session.videoArgs,
        audioArgs: session.audioArgs,
      });
    } catch (error) {
      this.logger.error(
        `Failed to transcode segment ${segmentIndex} for session ${session.sessionId}: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to transcode HLS segment.',
      );
    }

    if (!existsSync(fullPath)) {
      throw new NotFoundException('Segment unavailable.');
    }

    response.setHeader('Content-Type', 'video/mp2t');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(fullPath).pipe(response);
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
          .filter((entry) => entry.isDirectory() && !knownSessionIds.has(entry.name))
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
