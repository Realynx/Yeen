import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { access, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
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
import {
  SegmentNotYetDownloadedError,
  TorrentDataAvailabilityService,
} from './hls/torrent-data-availability.service';
import {
  computeSegmentTiming,
  parseSegmentIndex,
  totalSegmentCount,
} from '../../infrastructure/hls/hls-segment-naming';

/**
 * Thrown when the underlying media storage (typically the SMB share hosting
 * the file) does not respond to a basic existence check inside our budget.
 *
 * Surfaced from `resolveActualFilePath` so callers can fail the request fast
 * with HTTP 503 + Retry-After instead of letting ffmpeg stall on the same
 * unreachable I/O for the full segment-transcode timeout window.
 */
export class SourceUnreachableError extends Error {
  constructor(public readonly filePath: string) {
    super(`Source media path is unreachable: ${filePath}`);
    this.name = 'SourceUnreachableError';
  }
}

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
  // playlist" architecture. The current pipeline pre-writes a VOD manifest and
  // transcodes each segment on demand the first time it's requested.
  private readonly hlsSessionFormatVersion = 8;
  private readonly startSegmentRecoverableWindowMs = 30_000;
  private readonly maxStartSegmentRecoverableFailures = 4;

  constructor(
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
    options?: { forceFresh?: boolean; audioStreamIndex?: number | null },
  ) {
    const forceFresh = Boolean(options?.forceFresh);
    const requestedAudioStreamIndex = this.normalizeAudioStreamIndex(
      options?.audioStreamIndex,
    );
    const audioTracks = await this.mediaService.getPlaybackAudioTracks(mediaId);
    const selectedAudioStreamIndex = this.resolveRequestedAudioStreamIndex(
      requestedAudioStreamIndex,
      audioTracks,
    );

    const reusable = this.findReusableSession(
      mediaId,
      forceFresh,
      selectedAudioStreamIndex,
    );
    if (reusable) {
      return reusable;
    }

    const session = await this.createSession(mediaId, selectedAudioStreamIndex);
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

    const readySegmentIndices = await this.listReadySegmentIndices(
      session.outputDir,
    );
    const readySegments = readySegmentIndices.length;
    const highestReadySegment =
      readySegmentIndices.length > 0
        ? readySegmentIndices[readySegmentIndices.length - 1]
        : null;
    const contiguousReadySegments = this.computeContiguousReadySegments(
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
    let filePath: string;
    try {
      filePath = await this.resolveActualFilePath(canonicalFilePath);
    } catch (error) {
      if (error instanceof SourceUnreachableError) {
        this.logger.warn(`Direct stream blocked: ${error.message}`);
        response.setHeader('Cache-Control', 'no-store');
        throw new HttpException(
          'Media source is unreachable; check that the storage share is online.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw error;
    }
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
    // Probe the canonical path first. The `.!qB` in-progress variant is only
    // produced by qBittorrent when its "Append .!qB extension to incomplete
    // files" option is enabled, so most setups (including ours) only ever
    // need the canonical lookup. Falling back to the `.!qB` probe only when
    // canonical is genuinely missing avoids a wasted SMB roundtrip per
    // segment request and halves the wait when the share is unreachable.
    const canonicalProbe = await this.pathExistsWithTimeout(
      canonicalPath,
      5_000,
    );
    if (canonicalProbe === 'exists') {
      return canonicalPath;
    }
    if (canonicalProbe === 'timeout') {
      throw new SourceUnreachableError(canonicalPath);
    }

    const inProgressPath = canonicalPath + '.!qB';
    const inProgressProbe = await this.pathExistsWithTimeout(
      inProgressPath,
      5_000,
    );
    if (inProgressProbe === 'exists') {
      this.logger.debug(
        `Using in-progress source path for stream read: ${inProgressPath} (canonical missing)`,
      );
      return inProgressPath;
    }
    if (inProgressProbe === 'timeout') {
      throw new SourceUnreachableError(canonicalPath);
    }

    return canonicalPath;
  }

  // -- session lifecycle -----------------------------------------------------

  private findReusableSession(
    mediaId: string,
    forceFresh: boolean,
    selectedAudioStreamIndex: number | null,
  ) {
    const existing = this.hlsSessionStore.findReusableByMediaId(
      mediaId,
      selectedAudioStreamIndex,
    );
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
      selectedAudioStreamIndex: existing.selectedAudioStreamIndex,
    };
  }

  private async createSession(
    mediaId: string,
    selectedAudioStreamIndex: number | null,
  ): Promise<HlsSession> {
    const media = await this.mediaService.getById(mediaId);
    const torrentIndex =
      await this.torrentMediaIndexStore.getByMediaId(mediaId);
    const resolvedSourceFilePath = await this.mediaService
      .resolveMediaFilePath(media.filePath, media.relativePath)
      .catch(() => media.filePath);

    if (resolvedSourceFilePath !== media.filePath) {
      this.logger.debug(
        `Resolved imported media source path for session bootstrap: ${media.relativePath}`,
      );
    }

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
    const audioMapSpecifier =
      selectedAudioStreamIndex === null
        ? '0:a:0?'
        : `0:${selectedAudioStreamIndex}?`;

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
      // Store the canonical (non-.!qB) path here so per-segment resolution can
      // pick the right on-disk variant as the file is renamed mid-download.
      sourceFilePath: resolvedSourceFilePath,
      torrentHash: torrentIndex?.hash ?? null,
      ffmpegPath,
      segmentSeconds,
      totalDurationSeconds,
      totalSegments,
      selectedAudioStreamIndex,
      audioMapSpecifier,
      videoArgs,
      audioArgs,
      keyFrameInterval,
      startSegmentRecoverableWindowStartedAtMs: 0,
      startSegmentRecoverableFailures: 0,
    };
  }

  private normalizeAudioStreamIndex(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Number.isInteger(value) || value < 0) {
      return null;
    }

    return value;
  }

  private resolveRequestedAudioStreamIndex(
    requestedAudioStreamIndex: number | null,
    audioTracks: PlaybackAudioTrack[],
  ): number | null {
    if (audioTracks.length === 0) {
      return null;
    }

    if (requestedAudioStreamIndex === null) {
      return (
        audioTracks.find((track) => track.isDefault)?.streamIndex ??
        audioTracks[0].streamIndex
      );
    }

    if (
      audioTracks.some(
        (track) => track.streamIndex === requestedAudioStreamIndex,
      )
    ) {
      return requestedAudioStreamIndex;
    }

    throw new BadRequestException(
      'Selected audio track is not available for this media item.',
    );
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

    // Segment delivery is not a reliable resume signal because the client may
    // prefetch ahead of the actual playhead. Resume state is persisted only
    // from explicit player progress updates on /api/progress.

    // Re-assert sequential/first-last mode while HLS is actively requesting
    // early segments. This recovers torrents that drifted into random-piece
    // scheduling and leaves already-correct torrents unchanged.
    if (session.torrentHash) {
      void this.torrentService.ensureSequentialDownload(session.torrentHash);
    }

    // Re-resolve every request: qBittorrent renames downloading files
    // from `<name>.!qB` to `<name>` when the download completes, so the
    // path captured when the HLS session was first created can become
    // stale mid-playback. Resolving per segment lets transcodes continue
    // seamlessly across the rename.
    let sourceFilePath: string;
    try {
      sourceFilePath = await this.resolveActualFilePath(session.sourceFilePath);
    } catch (error) {
      if (error instanceof SourceUnreachableError) {
        this.logger.warn(`Segment ${segmentIndex} blocked: ${error.message}`);
        response.setHeader('Cache-Control', 'no-store');
        throw new HttpException(
          'Media source is unreachable; check that the storage share is online.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw error;
    }

    // Before spending CPU on a transcode that would just emit garbage,
    // verify the byte range this segment will read is actually present on
    // disk and not still pre-allocated zeros. If the data hasn't been
    // flushed yet (download is behind the player), respond 503 +
    // Retry-After so hls.js will buffer and re-request, not fatal-error.
    try {
      const sourceStat = await stat(sourceFilePath);
      await this.availability.assertSegmentReadable({
        filePath: sourceFilePath,
        segmentIndex,
        startSeconds: timing.startSeconds,
        durationSeconds: timing.durationSeconds,
        totalDurationSeconds: session.totalDurationSeconds,
        fileSize: sourceStat.size,
        mayBePartial: true,
      });
    } catch (error) {
      if (error instanceof SegmentNotYetDownloadedError) {
        this.logger.debug(
          `Segment ${segmentIndex} not ready for session ${session.sessionId}: ${error.message}`,
        );
        response.setHeader('Retry-After', '5');
        response.setHeader('Cache-Control', 'no-store');
        throw new HttpException(
          'Segment not yet downloaded; retry shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      // stat() error or other unexpected failure: fall through to ffmpeg,
      // which will surface a more accurate diagnostic.
      this.logger.warn(
        `Availability check failed for segment ${segmentIndex}: ${(error as Error).message}`,
      );
    }

    try {
      await this.segmentTranscoder.ensureSegment({
        sessionId: session.sessionId,
        segmentIndex,
        segmentPath: fullPath,
        ffmpegPath: session.ffmpegPath,
        sourceFilePath,
        startSeconds: timing.startSeconds,
        durationSeconds: timing.durationSeconds,
        audioMapSpecifier: session.audioMapSpecifier,
        videoArgs: session.videoArgs,
        audioArgs: session.audioArgs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isRecoverableTranscodeInputError(message)) {
        let startupSelfHealApplied = false;

        if (segmentIndex === 0) {
          const recoveredFromProxy = await this.tryRecoverStartSegmentViaProxy(
            session,
            fullPath,
            sourceFilePath,
            timing.startSeconds,
            timing.durationSeconds,
          );

          if (!recoveredFromProxy) {
            startupSelfHealApplied =
              await this.recordStartSegmentRecoverableFailure(
                session,
                fullPath,
              );
          }
        }

        if (existsSync(fullPath)) {
          if (segmentIndex === 0) {
            this.clearStartSegmentFailureState(session);
          }
          response.setHeader('Content-Type', 'video/mp2t');
          response.setHeader(
            'Cache-Control',
            'public, max-age=31536000, immutable',
          );
          createReadStream(fullPath).pipe(response);
          return;
        }

        this.logger.warn(
          `Segment ${segmentIndex} input not yet readable for session ${session.sessionId}; retrying soon. ${message}`,
        );
        if (startupSelfHealApplied) {
          response.setHeader('X-Yeen-Hls-Self-Heal', '1');
        }
        response.setHeader('Retry-After', startupSelfHealApplied ? '2' : '5');
        response.setHeader('Cache-Control', 'no-store');
        throw new HttpException(
          'Segment input not yet readable; retry shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      this.logger.error(
        `Failed to transcode segment ${segmentIndex} for session ${session.sessionId}: ${message}`,
      );
      throw new InternalServerErrorException(
        'Failed to transcode HLS segment.',
      );
    }

    if (segmentIndex === 0) {
      this.clearStartSegmentFailureState(session);
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

  private async listReadySegmentIndices(outputDir: string): Promise<number[]> {
    try {
      const entries = await readdir(outputDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => parseSegmentIndex(entry.name))
        .filter((index): index is number => index !== null)
        .sort((left, right) => left - right);
    } catch {
      return [];
    }
  }

  private computeContiguousReadySegments(
    readySegmentIndices: number[],
    totalSegments: number,
  ): number {
    let contiguous = 0;
    for (const segmentIndex of readySegmentIndices) {
      if (segmentIndex !== contiguous || contiguous >= totalSegments) {
        break;
      }
      contiguous += 1;
    }
    return contiguous;
  }

  private async pathExistsWithTimeout(
    filePath: string,
    timeoutMs: number,
  ): Promise<'exists' | 'missing' | 'timeout'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const probe = access(filePath).then(
        () => 'exists' as const,
        () => 'missing' as const,
      );
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
          this.logger.warn(
            `pathExistsWithTimeout: ${filePath} did not respond within ${timeoutMs}ms; treating as unreachable.`,
          );
          resolve('timeout');
        }, timeoutMs);
      });
      return await Promise.race([probe, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async readFileHeader(
    filePath: string,
    byteCount: number,
  ): Promise<Buffer | null> {
    return await readMediaFileHeader(filePath, byteCount);
  }

  private clearStartSegmentFailureState(session: HlsSession): void {
    session.startSegmentRecoverableWindowStartedAtMs = 0;
    session.startSegmentRecoverableFailures = 0;
  }

  private async tryRecoverStartSegmentViaProxy(
    session: HlsSession,
    segmentPath: string,
    sourceFilePath: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<boolean> {
    const attempts = [
      { forceRefresh: false, maxBytes: 64 * 1024 * 1024 },
      { forceRefresh: true, maxBytes: 128 * 1024 * 1024 },
    ];

    for (const attempt of attempts) {
      const proxyPath = await this.buildSegment0HeadProxy(
        session,
        sourceFilePath,
        attempt,
      );
      if (!proxyPath) {
        continue;
      }

      try {
        await this.segmentTranscoder.ensureSegment({
          sessionId: session.sessionId,
          segmentIndex: 0,
          segmentPath,
          ffmpegPath: session.ffmpegPath,
          sourceFilePath: proxyPath,
          startSeconds,
          durationSeconds,
          audioMapSpecifier: session.audioMapSpecifier,
          videoArgs: session.videoArgs,
          audioArgs: session.audioArgs,
        });
        return true;
      } catch (proxyError) {
        const proxyMessage =
          proxyError instanceof Error ? proxyError.message : String(proxyError);
        const label = attempt.forceRefresh ? 'refreshed proxy' : 'proxy';
        this.logger.warn(
          `Segment 0 ${label} transcode still not ready for session ${session.sessionId}: ${proxyMessage}`,
        );

        if (!this.isRecoverableTranscodeInputError(proxyMessage)) {
          break;
        }
      }
    }

    return false;
  }

  private async recordStartSegmentRecoverableFailure(
    session: HlsSession,
    segmentPath: string,
  ): Promise<boolean> {
    const now = Date.now();
    const windowStartedAt =
      session.startSegmentRecoverableWindowStartedAtMs ?? 0;

    if (now - windowStartedAt > this.startSegmentRecoverableWindowMs) {
      session.startSegmentRecoverableWindowStartedAtMs = now;
      session.startSegmentRecoverableFailures = 0;
    }

    const failures = (session.startSegmentRecoverableFailures ?? 0) + 1;
    session.startSegmentRecoverableFailures = failures;
    if (failures < this.maxStartSegmentRecoverableFailures) {
      return false;
    }

    this.logger.warn(
      `Segment 0 recoverable failures hit ${failures} within ${this.startSegmentRecoverableWindowMs}ms for session ${session.sessionId}; resetting startup artifacts.`,
    );
    this.clearStartSegmentFailureState(session);
    await this.resetStartSegmentArtifacts(session, segmentPath);
    return true;
  }

  private async resetStartSegmentArtifacts(
    session: HlsSession,
    segmentPath: string,
  ): Promise<void> {
    const proxyPath = this.getSegment0ProxyPath(session);
    await Promise.all(
      [
        rm(segmentPath, { force: true }),
        rm(`${segmentPath}.part`, { force: true }),
        rm(proxyPath, { force: true }),
        rm(`${proxyPath}.part`, { force: true }),
      ].map((task) => task.catch(() => undefined)),
    );
  }

  private getSegment0ProxyPath(session: HlsSession): string {
    return join(session.outputDir, 'source_head_proxy.mkv');
  }

  private async buildSegment0HeadProxy(
    session: HlsSession,
    sourceFilePath: string,
    options?: { forceRefresh?: boolean; maxBytes?: number },
  ): Promise<string | null> {
    const forceRefresh = Boolean(options?.forceRefresh);
    const maxBytes = Math.max(
      8 * 1024 * 1024,
      options?.maxBytes ?? 64 * 1024 * 1024,
    );
    const proxyPath = this.getSegment0ProxyPath(session);

    if (forceRefresh) {
      await rm(proxyPath, { force: true }).catch(() => undefined);
      await rm(`${proxyPath}.part`, { force: true }).catch(() => undefined);
    } else {
      try {
        const existing = await stat(proxyPath);
        if (existing.isFile() && existing.size > 0) {
          const existingHeader = await this.readFileHeader(proxyPath, 16);
          if (this.scoreMediaHeader(existingHeader) > 0) {
            return proxyPath;
          }

          await rm(proxyPath, { force: true }).catch(() => undefined);
          await rm(`${proxyPath}.part`, { force: true }).catch(() => undefined);
        }
      } catch {
        // Proxy not present yet; continue.
      }
    }

    const proxyBytes = await this.readProxyHeadBytes(sourceFilePath, maxBytes);
    if (
      !proxyBytes ||
      proxyBytes.length === 0 ||
      proxyBytes.every((byte) => byte === 0)
    ) {
      return null;
    }

    await writeFile(proxyPath, proxyBytes);
    this.logger.warn(
      `Built local segment-0 proxy for session ${session.sessionId} (${proxyBytes.length} bytes${forceRefresh ? ', refreshed' : ''}) from ${sourceFilePath}.`,
    );
    return proxyPath;
  }

  private async readProxyHeadBytes(
    filePath: string,
    byteCount: number,
  ): Promise<Buffer | null> {
    const uncached = await readMediaFileHeaderCached(filePath, byteCount, 'rs');
    if (
      uncached !== null &&
      uncached.length > 0 &&
      !uncached.every((byte) => byte === 0)
    ) {
      return uncached;
    }

    if (process.platform === 'win32') {
      const unbuffered = await readMediaFileHeaderUnbuffered(
        filePath,
        byteCount,
      );
      if (
        unbuffered !== null &&
        unbuffered.length > 0 &&
        !unbuffered.every((byte) => byte === 0)
      ) {
        return unbuffered;
      }
    }

    const cached = await readMediaFileHeaderCached(filePath, byteCount, 'r');
    if (
      cached !== null &&
      cached.length > 0 &&
      !cached.every((byte) => byte === 0)
    ) {
      return cached;
    }

    return null;
  }

  private scoreMediaHeader(header: Buffer | null): number {
    return scoreSharedMediaHeader(header);
  }

  private isRecoverableTranscodeInputError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('invalid data found when processing input') ||
      normalized.includes('ebml header parsing failed') ||
      normalized.includes('invalid as first byte of an ebml number') ||
      normalized.includes('error opening input file') ||
      normalized.includes('end of file')
    );
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
