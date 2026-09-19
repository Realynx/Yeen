import {
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ProgressivePlaybackSourceRegistry,
  ProgressiveSourceNotReadyError,
} from '../../../core/application/extensions/progressive-playback-source';
import type { HlsSession } from '../../infrastructure/stores/hls-session.store';
import {
  SegmentTranscodeCancelledError,
  SegmentTranscodeQueueOverloadedError,
  type HlsSegmentTranscoder,
} from './hls/hls-segment-transcoder.service';
import {
  computeSegmentTiming,
  parseSegmentIndex,
  segmentFileName,
} from '../../infrastructure/hls/hls-segment-naming';
import { computePrefetchSegmentIndicesValue } from './hls-segment-prefetch.helper';
import {
  clearStartSegmentFailureStateValue,
  isRecoverableTranscodeInputErrorValue,
  recordStartSegmentRecoverableFailureValue,
  tryRecoverStartSegmentViaProxyValue,
} from './start-segment-recovery.helper';
import { pruneOldHlsSegmentsValue } from './hls-segment-cache-pruning.helper';

const HLS_SEGMENT_CACHE_BEHIND_SECONDS = 3 * 60;

interface ServeHlsSegmentInput {
  session: HlsSession;
  fileName: string;
  fullPath: string;
  response: Response;
  logger: Logger;
  progressivePlaybackSources: ProgressivePlaybackSourceRegistry;
  segmentTranscoder: HlsSegmentTranscoder;
  startSegmentRecoverableWindowMs: number;
  maxStartSegmentRecoverableFailures: number;
  forceMuxedAudio?: boolean;
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
    progressivePlaybackSources,
    segmentTranscoder,
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

  if (session.progressiveSource) {
    void progressivePlaybackSources.prioritize(session.progressiveSource);
  }

  const sourceFilePath = await resolveReachableSourcePath(
    session.sourceFilePath,
    response,
    `Segment ${segmentIndex}`,
  );

  await assertSourceAvailability(input, sourceFilePath, segmentIndex, timing);

  try {
    await segmentTranscoder.ensureSegment({
      mediaKind: session.mediaKind,
      videoEncoder: session.videoEncoder,
      softwareVideoPipeline:
        session.videoEncoder === 'nvidia' && session.inputArgs.length === 0,
      sessionId: session.sessionId,
      segmentIndex,
      segmentPath: fullPath,
      ffmpegPath: session.ffmpegPath,
      sourceFilePath,
      startSeconds: timing.startSeconds,
      durationSeconds: timing.durationSeconds,
      audioMapSpecifier: session.audioMapSpecifier,
      inputArgs: session.inputArgs,
      videoArgs: session.videoArgs,
      audioArgs: session.audioArgs,
      includeAudio: input.forceMuxedAudio || !session.continuousAudio,
    });
  } catch (error) {
    const served = await handleTranscodeError(
      input,
      error,
      sourceFilePath,
      segmentIndex,
      timing,
    );
    if (served) return;
  }

  if (segmentIndex === 0) {
    clearStartSegmentFailureStateValue(session);
  }

  if (!session.progressiveSource?.mayBePartial) {
    const prefetchRequests = computePrefetchSegmentIndicesValue(
      segmentIndex,
      session.segmentSeconds,
      session.totalSegments,
    ).map((prefetchIndex) => {
      const prefetchTiming = computeSegmentTiming(
        prefetchIndex,
        session.segmentSeconds,
        session.totalDurationSeconds,
        session.totalSegments,
      );
      return {
        mediaKind: session.mediaKind,
        videoEncoder: session.videoEncoder,
        softwareVideoPipeline:
          session.videoEncoder === 'nvidia' && session.inputArgs.length === 0,
        sessionId: session.sessionId,
        segmentIndex: prefetchIndex,
        segmentPath: join(session.outputDir, segmentFileName(prefetchIndex)),
        ffmpegPath: session.ffmpegPath,
        sourceFilePath,
        startSeconds: prefetchTiming.startSeconds,
        durationSeconds: prefetchTiming.durationSeconds,
        audioMapSpecifier: session.audioMapSpecifier,
        inputArgs: session.inputArgs,
        videoArgs: session.videoArgs,
        audioArgs: session.audioArgs,
        includeAudio: input.forceMuxedAudio || !session.continuousAudio,
      };
    });
    segmentTranscoder.prefetchSegments(prefetchRequests);
  }

  if (!existsSync(fullPath)) {
    throw new NotFoundException('Segment unavailable.');
  }

  response.setHeader('Content-Type', 'video/mp2t');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(fullPath).pipe(response);
  scheduleSegmentCachePrune(input, segmentIndex);
}

async function assertSourceAvailability(
  input: ServeHlsSegmentInput,
  sourceFilePath: string,
  segmentIndex: number,
  timing: { startSeconds: number; durationSeconds: number },
): Promise<void> {
  try {
    const sourceStat = await stat(sourceFilePath);
    if (!input.session.progressiveSource?.mayBePartial) return;
    await input.progressivePlaybackSources.assertSegmentReadable(
      input.session.progressiveSource,
      {
        filePath: sourceFilePath,
        segmentIndex,
        startSeconds: timing.startSeconds,
        durationSeconds: timing.durationSeconds,
        totalDurationSeconds: input.session.totalDurationSeconds,
        fileSize: sourceStat.size,
      },
    );
  } catch (error) {
    if (isProgressiveSourceNotReady(error)) {
      input.logger.debug(
        `Segment ${segmentIndex} not ready for session ${input.session.sessionId}: ${errorMessage(error)}`,
      );
      input.response.setHeader('Retry-After', '5');
      input.response.setHeader('Cache-Control', 'no-store');
      throw new HttpException(
        'Segment not yet downloaded; retry shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    input.logger.warn(
      `Availability check failed for segment ${segmentIndex}: ${errorMessage(error)}`,
    );
  }
}

async function handleTranscodeError(
  input: ServeHlsSegmentInput,
  error: unknown,
  sourceFilePath: string,
  segmentIndex: number,
  timing: { startSeconds: number; durationSeconds: number },
): Promise<boolean> {
  if (error instanceof SegmentTranscodeCancelledError) {
    input.response.setHeader('Cache-Control', 'no-store');
    throw new NotFoundException('HLS session is no longer active.');
  }
  if (error instanceof SegmentTranscodeQueueOverloadedError) {
    handleQueueOverload(input, error, segmentIndex);
  }
  const message = errorMessage(error);
  if (
    await tryHardwarePipelineFallback(
      input,
      sourceFilePath,
      segmentIndex,
      timing,
      message,
    )
  ) {
    return true;
  }
  if (isRecoverableTranscodeInputErrorValue(message)) {
    return handleRecoverableTranscodeError(
      input,
      sourceFilePath,
      segmentIndex,
      timing,
      message,
    );
  }
  input.logger.error(
    `Failed to transcode segment ${segmentIndex} for session ${input.session.sessionId}: ${message}`,
  );
  input.response.setHeader('X-Yeen-Hls-Permanent-Failure', '1');
  input.response.setHeader('Cache-Control', 'no-store');
  throw new HttpException(
    'Media could not be transcoded with the active playback profile.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

async function tryHardwarePipelineFallback(
  input: ServeHlsSegmentInput,
  sourceFilePath: string,
  segmentIndex: number,
  timing: { startSeconds: number; durationSeconds: number },
  message: string,
): Promise<boolean> {
  const cpuFallbackArgs = input.session.cpuFallbackVideoArgs;
  const softwareNvencArgs = input.session.softwareNvencFallbackVideoArgs;
  // Any deterministic ffmpeg failure on the NVIDIA pipeline is a reason to
  // retreat down the ladder. Matching stderr text kept missing real failures:
  // when the GPU cannot NVDEC the source codec, ffmpeg quietly decodes in
  // software and the filtergraph then dies at its *input* with "Impossible to
  // convert between the formats ...", naming neither CUDA nor NVENC. That
  // wording also drifts between ffmpeg builds (auto_scale_0 vs auto_scaler_0).
  // Transient input problems still belong to the retry path, not here.
  if (
    input.session.videoEncoder !== 'nvidia' ||
    !cpuFallbackArgs ||
    isRecoverableTranscodeInputErrorValue(message)
  ) {
    return false;
  }

  if (softwareNvencArgs) {
    input.logger.warn(
      `CUDA input pipeline failed for session ${input.session.sessionId}; retrying segment ${segmentIndex} with software conversion and NVENC. ${message}`,
    );
    try {
      await input.segmentTranscoder.ensureSegment({
        mediaKind: input.session.mediaKind,
        videoEncoder: 'nvidia',
        softwareVideoPipeline: true,
        sessionId: input.session.sessionId,
        segmentIndex,
        segmentPath: input.fullPath,
        ffmpegPath: input.session.ffmpegPath,
        sourceFilePath,
        startSeconds: timing.startSeconds,
        durationSeconds: timing.durationSeconds,
        audioMapSpecifier: input.session.audioMapSpecifier,
        inputArgs: [],
        videoArgs: softwareNvencArgs,
        audioArgs: input.session.audioArgs,
        includeAudio: input.forceMuxedAudio || !input.session.continuousAudio,
      });
      input.session.inputArgs = [];
      input.session.videoArgs = softwareNvencArgs;
      input.session.softwareNvencFallbackVideoArgs = undefined;
      sendSegment(input.fullPath, input.response);
      scheduleSegmentCachePrune(input, segmentIndex);
      return true;
    } catch (fallbackError) {
      // Backpressure is a "come back in a moment", not a verdict on this media.
      // Reporting it as a permanent failure tears the player down for good,
      // which is what happened whenever a second AV1 session arrived while the
      // first still held the single software-pipeline slot.
      if (fallbackError instanceof SegmentTranscodeQueueOverloadedError) {
        handleQueueOverload(input, fallbackError, segmentIndex);
      }
      input.logger.warn(
        `Software-conversion NVENC fallback failed for session ${input.session.sessionId} segment ${segmentIndex}; retrying with CPU encoding. ${errorMessage(fallbackError)}`,
      );
    }
  }

  try {
    await input.segmentTranscoder.ensureSegment({
      mediaKind: input.session.mediaKind,
      videoEncoder: 'cpu',
      sessionId: input.session.sessionId,
      segmentIndex,
      segmentPath: input.fullPath,
      ffmpegPath: input.session.ffmpegPath,
      sourceFilePath,
      startSeconds: timing.startSeconds,
      durationSeconds: timing.durationSeconds,
      audioMapSpecifier: input.session.audioMapSpecifier,
      inputArgs: [],
      videoArgs: cpuFallbackArgs,
      audioArgs: input.session.audioArgs,
      includeAudio: input.forceMuxedAudio || !input.session.continuousAudio,
    });
    input.session.videoEncoder = 'cpu';
    input.session.inputArgs = [];
    input.session.videoArgs = cpuFallbackArgs;
    input.session.softwareNvencFallbackVideoArgs = undefined;
    input.session.cpuFallbackVideoArgs = undefined;
    sendSegment(input.fullPath, input.response);
    scheduleSegmentCachePrune(input, segmentIndex);
    return true;
  } catch (cpuError) {
    if (cpuError instanceof SegmentTranscodeQueueOverloadedError) {
      handleQueueOverload(input, cpuError, segmentIndex);
    }
    input.logger.error(
      `CPU fallback failed for session ${input.session.sessionId} segment ${segmentIndex}: ${errorMessage(cpuError)}`,
    );
    return false;
  }
}

function handleQueueOverload(
  input: ServeHlsSegmentInput,
  error: SegmentTranscodeQueueOverloadedError,
  segmentIndex: number,
): never {
  input.logger.warn(
    `Backpressure for session ${input.session.sessionId} segment ${segmentIndex} (global=${error.totalInflight}, session=${error.sessionInflight}).`,
  );
  input.response.setHeader('X-Yeen-Hls-Overloaded', '1');
  input.response.setHeader('Retry-After', String(error.retryAfterSeconds));
  input.response.setHeader('Cache-Control', 'no-store');
  throw new HttpException(
    'Transcode queue overloaded; retry shortly.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

async function handleRecoverableTranscodeError(
  input: ServeHlsSegmentInput,
  sourceFilePath: string,
  segmentIndex: number,
  timing: { startSeconds: number; durationSeconds: number },
  message: string,
): Promise<boolean> {
  const startupSelfHealApplied = await attemptStartupRecovery(
    input,
    sourceFilePath,
    segmentIndex,
    timing,
  );
  if (existsSync(input.fullPath)) {
    if (segmentIndex === 0) clearStartSegmentFailureStateValue(input.session);
    sendSegment(input.fullPath, input.response);
    scheduleSegmentCachePrune(input, segmentIndex);
    return true;
  }
  input.logger.warn(
    `Segment ${segmentIndex} input not yet readable for session ${input.session.sessionId}; retrying soon. ${message}`,
  );
  if (startupSelfHealApplied) {
    input.response.setHeader('X-Yeen-Hls-Self-Heal', '1');
  }
  input.response.setHeader('Retry-After', startupSelfHealApplied ? '2' : '5');
  input.response.setHeader('Cache-Control', 'no-store');
  throw new HttpException(
    'Segment input not yet readable; retry shortly.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

async function attemptStartupRecovery(
  input: ServeHlsSegmentInput,
  sourceFilePath: string,
  segmentIndex: number,
  timing: { startSeconds: number; durationSeconds: number },
): Promise<boolean> {
  if (segmentIndex !== 0) return false;
  const recovered = await tryRecoverStartSegmentViaProxyValue(
    input.session,
    input.fullPath,
    sourceFilePath,
    timing.startSeconds,
    timing.durationSeconds,
    input.segmentTranscoder,
    input.logger,
  );
  if (recovered) return false;
  return recordStartSegmentRecoverableFailureValue(
    input.session,
    input.fullPath,
    input.startSegmentRecoverableWindowMs,
    input.maxStartSegmentRecoverableFailures,
    input.logger,
  );
}

function sendSegment(path: string, response: Response): void {
  response.setHeader('Content-Type', 'video/mp2t');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  createReadStream(path).pipe(response);
}

function scheduleSegmentCachePrune(
  input: ServeHlsSegmentInput,
  currentSegmentIndex: number,
): void {
  const protectedSegmentIndices = new Set(
    input.segmentTranscoder.getInflightSegmentIndices?.(
      input.session.sessionId,
    ) ?? [],
  );
  protectedSegmentIndices.add(currentSegmentIndex);
  void pruneOldHlsSegmentsValue({
    outputDir: input.session.outputDir,
    currentSegmentIndex,
    segmentSeconds: input.session.segmentSeconds,
    keepBehindSeconds: HLS_SEGMENT_CACHE_BEHIND_SECONDS,
    protectedSegmentIndices,
  }).catch((error: unknown) => {
    input.logger.warn(
      `HLS segment cache pruning failed for session ${input.session.sessionId}: ${errorMessage(error)}`,
    );
  });
}

function isProgressiveSourceNotReady(error: unknown): boolean {
  if (error instanceof ProgressiveSourceNotReadyError) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'YEEN_PROGRESSIVE_SOURCE_NOT_READY'
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}
