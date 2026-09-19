import {
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaService } from '../../../media/application/services/media.service';
import type {
  ProgressivePlaybackSourceRef,
  ProgressivePlaybackSourceRegistry,
} from '../../../core/application/extensions/progressive-playback-source';
import type {
  HlsSession,
  HlsSessionStore,
} from '../../infrastructure/stores/hls-session.store';
import type { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import {
  buildAudioEncoderArgs,
  buildVideoDecoderInputArgs,
  buildVideoEncoderArgs,
  computeKeyFrameInterval,
  type VideoEncoder,
} from '../../infrastructure/hls/hls-ffmpeg-args';
import { totalSegmentCount } from '../../infrastructure/hls/hls-segment-naming';

export interface ResolvedTranscodeProfile {
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
}

export interface ReusableHlsSession {
  sessionId: string;
  manifestUrl: string;
  totalDurationSeconds: number;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
}

interface ActiveHlsStart<T> {
  forceFresh: boolean;
  promise: Promise<T>;
}

export class HlsStartSingleFlight<T> {
  private readonly activeByKey = new Map<string, ActiveHlsStart<T>>();

  run(
    key: string,
    forceFresh: boolean,
    start: (forceFresh: boolean) => Promise<T>,
  ): Promise<T> {
    const active = this.activeByKey.get(key);
    if (active && (!forceFresh || active.forceFresh)) {
      return active.promise;
    }

    const promise = active
      ? active.promise.then(
          () => start(true),
          () => start(true),
        )
      : start(forceFresh);
    const entry = { forceFresh, promise };
    this.activeByKey.set(key, entry);

    void promise.then(
      () => this.clear(key, entry),
      () => this.clear(key, entry),
    );
    return promise;
  }

  private clear(key: string, entry: ActiveHlsStart<T>): void {
    if (this.activeByKey.get(key) === entry) {
      this.activeByKey.delete(key);
    }
  }
}

export function buildHlsStartKeyValue(
  mediaId: string,
  selectedAudioStreamIndex: number | null,
  transcodeProfile: ResolvedTranscodeProfile,
  videoEncoder: VideoEncoder,
): string {
  return JSON.stringify([
    mediaId,
    selectedAudioStreamIndex,
    transcodeProfile.maxVideoBitrateKbps,
    transcodeProfile.audioBitrateKbps,
    transcodeProfile.maxOutputHeight,
    videoEncoder,
  ]);
}

interface SessionBootstrapSettings {
  ffmpegPath: string;
  hlsSegmentSeconds: number;
  transcodePreset: string;
  transcodeCrf: number;
  transcodeRateControlBufferSeconds: number;
  videoEncoder: VideoEncoder;
}

function sourceMayBePartial(
  source: ProgressivePlaybackSourceRef | null,
): boolean {
  return source?.mayBePartial ?? false;
}

async function assertHlsSourceAvailable(
  sourceFilePath: string,
  progressiveSource: Awaited<
    ReturnType<ProgressivePlaybackSourceRegistry['resolveSource']>
  >,
  logger: Logger,
): Promise<void> {
  if (progressiveSource) {
    return;
  }
  try {
    const sourceStat = await stat(sourceFilePath);
    if (!sourceStat.isFile()) {
      throw new Error('Resolved source is not a file.');
    }
  } catch (error) {
    logger.warn(
      `HLS start blocked because media source is unreachable: ${sourceFilePath} (${error instanceof Error ? error.message : String(error)})`,
    );
    throw new BadGatewayException(
      'Media source is unreachable; check that the storage share is online or rescan the library.',
    );
  }
}

/**
 * Attempts to find and return a reusable HLS session for a media ID and audio
 * stream index. Returns null if no session exists, if forceFresh is true, or if
 * the session format version is outdated. Discards stale sessions automatically.
 */
export async function findReusableSessionValue(
  mediaId: string,
  forceFresh: boolean,
  selectedAudioStreamIndex: number | null,
  transcodeProfile: ResolvedTranscodeProfile,
  expectedSegmentSeconds: number,
  expectedVideoEncoder: VideoEncoder,
  hlsSessionStore: HlsSessionStore,
  hlsSessionFormatVersion: number,
  segmentTranscoder: HlsSegmentTranscoder,
  cancelContinuousAudio?: (sessionId: string) => Promise<void>,
): Promise<ReusableHlsSession | null> {
  const existing = hlsSessionStore.findReusableByMediaId(
    mediaId,
    selectedAudioStreamIndex,
    transcodeProfile.maxVideoBitrateKbps,
    transcodeProfile.audioBitrateKbps,
    transcodeProfile.maxOutputHeight,
  );
  if (!existing) {
    return null;
  }

  if (
    forceFresh ||
    existing.formatVersion !== hlsSessionFormatVersion ||
    existing.segmentSeconds !== expectedSegmentSeconds ||
    existing.videoEncoder !== expectedVideoEncoder
  ) {
    hlsSessionStore.delete(existing.sessionId);
    await segmentTranscoder.cancelForSession(existing.sessionId);
    await cancelContinuousAudio?.(existing.sessionId);
    await rm(existing.outputDir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup
    });
    return null;
  }

  return {
    sessionId: existing.sessionId,
    manifestUrl: `/api/stream/hls/${existing.sessionId}/master.m3u8`,
    totalDurationSeconds: existing.totalDurationSeconds,
    selectedAudioStreamIndex: existing.selectedAudioStreamIndex,
    maxVideoBitrateKbps: existing.maxVideoBitrateKbps,
    audioBitrateKbps: existing.audioBitrateKbps,
    maxOutputHeight: existing.maxOutputHeight,
  };
}

/**
 * Creates a new HLS session for a media item, bootstrapping encoder arguments
 * and segment configuration. Throws InternalServerErrorException if media has
 * no known duration.
 */
export async function createSessionValue(
  mediaId: string,
  selectedAudioStreamIndex: number | null,
  hlsRoot: string,
  hlsSessionFormatVersion: number,
  mediaService: MediaService,
  progressivePlaybackSources: ProgressivePlaybackSourceRegistry,
  logger: Logger,
  systemSettings: SessionBootstrapSettings,
  transcodeProfile: ResolvedTranscodeProfile,
): Promise<HlsSession> {
  const media = await mediaService.getById(mediaId);
  const resolvedSourceFilePath = await mediaService
    .resolveMediaFilePath(media.filePath, media.relativePath)
    .catch(() => media.filePath);
  const progressiveSource = await progressivePlaybackSources.resolveSource(
    mediaId,
    resolvedSourceFilePath,
  );

  await assertHlsSourceAvailable(
    resolvedSourceFilePath,
    progressiveSource,
    logger,
  );

  if (resolvedSourceFilePath !== media.filePath) {
    logger.debug(
      `Resolved imported media source path for session bootstrap: ${media.relativePath}`,
    );
  }

  // Build the playlist from the real source file's duration, not the stored
  // `durationSeconds` — which for partial/remote-catalog items can be an estimate
  // (file-size guess or official catalog runtime) tens of minutes off the actual
  // file. Trusting that estimate truncates the manifest and cuts playback short.
  const totalDurationSeconds =
    await mediaService.reconcileSourceDurationSeconds(
      mediaId,
      resolvedSourceFilePath,
      { mayBePartial: sourceMayBePartial(progressiveSource) },
    );

  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    throw new InternalServerErrorException(
      'Media has no known duration; cannot build HLS playlist.',
    );
  }

  const ffmpegPath = systemSettings.ffmpegPath || 'ffmpeg';
  const mediaKind =
    media.libraryType === 'music' || media.digitalMediaType === 'audio'
      ? 'audio'
      : 'video';
  const segmentSeconds = Math.max(systemSettings.hlsSegmentSeconds, 1);
  const keyFrameInterval =
    mediaKind === 'video'
      ? computeKeyFrameInterval(media.mediaDetails.frameRate, segmentSeconds)
      : 0;

  const sessionId = randomUUID();
  const outputDir = join(hlsRoot, sessionId);
  const manifestPath = join(outputDir, 'master.m3u8');

  await mkdir(outputDir, { recursive: true });

  const videoConfig = {
    keyFrameInterval,
    preset: systemSettings.transcodePreset,
    crf: systemSettings.transcodeCrf,
    maxVideoBitrateKbps: transcodeProfile.maxVideoBitrateKbps,
    maxOutputHeight: transcodeProfile.maxOutputHeight,
    rateControlBufferSeconds: systemSettings.transcodeRateControlBufferSeconds,
  };
  const videoArgs =
    mediaKind === 'video'
      ? buildVideoEncoderArgs({
          ...videoConfig,
          hardwareAcceleration: systemSettings.videoEncoder,
        })
      : [];
  const cpuFallbackVideoArgs =
    mediaKind === 'video' && systemSettings.videoEncoder === 'nvidia'
      ? buildVideoEncoderArgs({ ...videoConfig, hardwareAcceleration: 'cpu' })
      : undefined;
  const softwareNvencFallbackVideoArgs =
    mediaKind === 'video' && systemSettings.videoEncoder === 'nvidia'
      ? buildVideoEncoderArgs({
          ...videoConfig,
          hardwareAcceleration: 'nvidia',
          nvidiaInputMode: 'software',
        })
      : undefined;
  const inputArgs =
    mediaKind === 'video'
      ? buildVideoDecoderInputArgs(systemSettings.videoEncoder)
      : [];
  const audioArgs = buildAudioEncoderArgs({
    audioBitrateKbps: transcodeProfile.audioBitrateKbps,
  });
  const audioMapSpecifier =
    selectedAudioStreamIndex === null
      ? '0:a:0?'
      : `0:${selectedAudioStreamIndex}?`;

  const totalSegments = totalSegmentCount(totalDurationSeconds, segmentSeconds);

  return {
    sessionId,
    mediaId,
    outputDir,
    manifestPath,
    startedAt: new Date().toISOString(),
    formatVersion: hlsSessionFormatVersion,
    mediaKind,
    // Store the canonical (non-.!qB) path here so per-segment resolution can
    // pick the right on-disk variant as the file is renamed mid-download.
    sourceFilePath: resolvedSourceFilePath,
    progressiveSource,
    ffmpegPath,
    segmentSeconds,
    totalDurationSeconds,
    totalSegments,
    selectedAudioStreamIndex,
    maxVideoBitrateKbps: transcodeProfile.maxVideoBitrateKbps,
    audioBitrateKbps: transcodeProfile.audioBitrateKbps,
    maxOutputHeight: transcodeProfile.maxOutputHeight,
    audioMapSpecifier,
    videoEncoder: systemSettings.videoEncoder,
    inputArgs,
    videoArgs,
    softwareNvencFallbackVideoArgs,
    cpuFallbackVideoArgs,
    audioArgs,
    continuousAudio: false,
    keyFrameInterval,
    startSegmentRecoverableWindowStartedAtMs: 0,
    startSegmentRecoverableFailures: 0,
  };
}

/**
 * Discards an HLS session by canceling any in-flight transcodes, removing
 * it from the session store, and cleaning up the output directory.
 */
export async function discardSessionValue(
  sessionId: string,
  hlsSessionStore: HlsSessionStore,
  segmentTranscoder: HlsSegmentTranscoder,
  cancelContinuousAudio?: (sessionId: string) => Promise<void>,
): Promise<void> {
  const session = hlsSessionStore.delete(sessionId);
  await segmentTranscoder.cancelForSession(sessionId);
  await cancelContinuousAudio?.(sessionId);
  if (!session) {
    return;
  }

  await rm(session.outputDir, { recursive: true, force: true }).catch(() => {
    // best-effort cleanup
  });
}
