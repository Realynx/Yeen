import {
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaService } from '../../../../media/application/services/media.service';
import type { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import type { TorrentMediaIndexStore } from '../../../../torrent/infrastructure/stores/torrent-media-index.store';
import type {
  HlsSession,
  HlsSessionStore,
} from '../../../infrastructure/stores/hls-session.store';
import type { HlsSegmentTranscoder } from '../hls/hls-segment-transcoder.service';
import {
  buildAudioEncoderArgs,
  buildVideoEncoderArgs,
  computeKeyFrameInterval,
} from '../../../infrastructure/hls/hls-ffmpeg-args';
import {
  totalSegmentCount,
} from '../../../infrastructure/hls/hls-segment-naming';

/**
 * Attempts to find and return a reusable HLS session for a media ID and audio
 * stream index. Returns null if no session exists, if forceFresh is true, or if
 * the session format version is outdated. Discards stale sessions automatically.
 */
export function findReusableSessionValue(
  mediaId: string,
  forceFresh: boolean,
  selectedAudioStreamIndex: number | null,
  hlsSessionStore: HlsSessionStore,
  hlsSessionFormatVersion: number,
  segmentTranscoder: HlsSegmentTranscoder,
): {
  sessionId: string;
  manifestUrl: string;
  selectedAudioStreamIndex: number | null;
} | null {
  const existing = hlsSessionStore.findReusableByMediaId(
    mediaId,
    selectedAudioStreamIndex,
  );
  if (!existing) {
    return null;
  }

  if (forceFresh || existing.formatVersion !== hlsSessionFormatVersion) {
    // Discard stale session by canceling transcodes and removing from store
    segmentTranscoder.cancelForSession(existing.sessionId);
    hlsSessionStore.delete(existing.sessionId);
    void rm(existing.outputDir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup
    });
    return null;
  }

  return {
    sessionId: existing.sessionId,
    manifestUrl: `/api/stream/hls/${existing.sessionId}/master.m3u8`,
    selectedAudioStreamIndex: existing.selectedAudioStreamIndex,
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
  systemSettingsService: SystemSettingsService,
  torrentMediaIndexStore: TorrentMediaIndexStore,
  logger: Logger,
): Promise<HlsSession> {
  const media = await mediaService.getById(mediaId);
  const torrentIndex = await torrentMediaIndexStore.getByMediaId(mediaId);
  const resolvedSourceFilePath = await mediaService
    .resolveMediaFilePath(media.filePath, media.relativePath)
    .catch(() => media.filePath);

  if (resolvedSourceFilePath !== media.filePath) {
    logger.debug(
      `Resolved imported media source path for session bootstrap: ${media.relativePath}`,
    );
  }

  if (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
    throw new InternalServerErrorException(
      'Media has no known duration; cannot build HLS playlist.',
    );
  }

  const systemSettings = await systemSettingsService.getSettings();
  const ffmpegPath = systemSettings.ffmpegPath || 'ffmpeg';
  const segmentSeconds = Math.max(systemSettings.hlsSegmentSeconds, 1);
  const keyFrameInterval = computeKeyFrameInterval(
    media.mediaDetails.frameRate,
    segmentSeconds,
  );

  const sessionId = randomUUID();
  const outputDir = join(hlsRoot, sessionId);
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
    formatVersion: hlsSessionFormatVersion,
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

/**
 * Discards an HLS session by canceling any in-flight transcodes, removing
 * it from the session store, and cleaning up the output directory.
 */
export function discardSessionValue(
  sessionId: string,
  hlsSessionStore: HlsSessionStore,
  segmentTranscoder: HlsSegmentTranscoder,
): void {
  const session = hlsSessionStore.get(sessionId);
  if (!session) {
    return;
  }

  segmentTranscoder.cancelForSession(sessionId);
  hlsSessionStore.delete(sessionId);
  void rm(session.outputDir, { recursive: true, force: true }).catch(() => {
    // best-effort cleanup
  });
}
