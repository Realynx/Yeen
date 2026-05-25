import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { TorrentService } from '../../../torrent/application/services/torrent.service';
import type { HlsSession } from '../../infrastructure/stores/hls-session.store';
import {
  SegmentTranscodeQueueOverloadedError,
  type HlsSegmentTranscoder,
} from './hls/hls-segment-transcoder.service';
import {
  SegmentNotYetDownloadedError,
  type TorrentDataAvailabilityService,
} from './hls/torrent-data-availability.service';
import {
  computeSegmentTiming,
  parseSegmentIndex,
} from '../../infrastructure/hls/hls-segment-naming';
import {
  clearStartSegmentFailureStateValue,
  isRecoverableTranscodeInputErrorValue,
  recordStartSegmentRecoverableFailureValue,
  tryRecoverStartSegmentViaProxyValue,
} from './start-segment-recovery.helper';

interface ServeHlsSegmentInput {
  session: HlsSession;
  fileName: string;
  fullPath: string;
  response: Response;
  logger: Logger;
  torrentService: TorrentService;
  availability: TorrentDataAvailabilityService;
  segmentTranscoder: HlsSegmentTranscoder;
  startSegmentRecoverableWindowMs: number;
  maxStartSegmentRecoverableFailures: number;
  resolveReachableSourcePath: (
    canonicalPath: string,
    response: Response,
    context: string,
  ) => Promise<string>;
}

export async function serveHlsSegmentValue(
  input: ServeHlsSegmentInput,
): Promise<void> {
  const {
    session,
    fileName,
    fullPath,
    response,
    logger,
    torrentService,
    availability,
    segmentTranscoder,
    startSegmentRecoverableWindowMs,
    maxStartSegmentRecoverableFailures,
    resolveReachableSourcePath,
  } = input;

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

  if (session.torrentHash) {
    void torrentService.ensureSequentialDownload(session.torrentHash);
  }

  const sourceFilePath = await resolveReachableSourcePath(
    session.sourceFilePath,
    response,
    `Segment ${segmentIndex}`,
  );

  try {
    const sourceStat = await stat(sourceFilePath);
    await availability.assertSegmentReadable({
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
      logger.debug(
        `Segment ${segmentIndex} not ready for session ${session.sessionId}: ${error.message}`,
      );
      response.setHeader('Retry-After', '5');
      response.setHeader('Cache-Control', 'no-store');
      throw new HttpException(
        'Segment not yet downloaded; retry shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    logger.warn(
      `Availability check failed for segment ${segmentIndex}: ${(error as Error).message}`,
    );
  }

  try {
    await segmentTranscoder.ensureSegment({
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
    if (error instanceof SegmentTranscodeQueueOverloadedError) {
      logger.warn(
        `Backpressure for session ${session.sessionId} segment ${segmentIndex} (global=${error.totalInflight}, session=${error.sessionInflight}).`,
      );
      response.setHeader('X-Yeen-Hls-Overloaded', '1');
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
      response.setHeader('Cache-Control', 'no-store');
      throw new HttpException(
        'Transcode queue overloaded; retry shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    if (isRecoverableTranscodeInputErrorValue(message)) {
      let startupSelfHealApplied = false;

      if (segmentIndex === 0) {
        const recoveredFromProxy = await tryRecoverStartSegmentViaProxyValue(
          session,
          fullPath,
          sourceFilePath,
          timing.startSeconds,
          timing.durationSeconds,
          segmentTranscoder,
          logger,
        );

        if (!recoveredFromProxy) {
          startupSelfHealApplied =
            await recordStartSegmentRecoverableFailureValue(
              session,
              fullPath,
              startSegmentRecoverableWindowMs,
              maxStartSegmentRecoverableFailures,
              logger,
            );
        }
      }

      if (existsSync(fullPath)) {
        if (segmentIndex === 0) {
          clearStartSegmentFailureStateValue(session);
        }
        response.setHeader('Content-Type', 'video/mp2t');
        response.setHeader(
          'Cache-Control',
          'public, max-age=31536000, immutable',
        );
        createReadStream(fullPath).pipe(response);
        return;
      }

      logger.warn(
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

    logger.error(
      `Failed to transcode segment ${segmentIndex} for session ${session.sessionId}: ${message}`,
    );
    throw new InternalServerErrorException('Failed to transcode HLS segment.');
  }

  if (segmentIndex === 0) {
    clearStartSegmentFailureStateValue(session);
  }

  if (!existsSync(fullPath)) {
    throw new NotFoundException('Segment unavailable.');
  }

  response.setHeader('Content-Type', 'video/mp2t');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(fullPath).pipe(response);
}
