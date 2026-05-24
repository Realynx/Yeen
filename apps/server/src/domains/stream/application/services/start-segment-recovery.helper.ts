import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HlsSession } from '../../infrastructure/stores/hls-session.store';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import {
  readMediaFileHeader,
  readMediaFileHeaderCached,
  readMediaFileHeaderUnbuffered,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../core/infrastructure/shared/media-header-probe';

/**
 * Classifies a transcode error message as recoverable (temporary input issue)
 * vs. permanent failure. Recoverable errors trigger retry/proxy strategies.
 */
export function isRecoverableTranscodeInputErrorValue(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid data found when processing input') ||
    normalized.includes('ebml header parsing failed') ||
    normalized.includes('invalid as first byte of an ebml number') ||
    normalized.includes('error opening input file') ||
    normalized.includes('end of file')
  );
}

/**
 * Clears the startup segment failure recovery window on a session, resetting
 * failure counters so recovery can restart if the issue recurs later.
 */
export function clearStartSegmentFailureStateValue(
  session: HlsSession,
): void {
  session.startSegmentRecoverableWindowStartedAtMs = 0;
  session.startSegmentRecoverableFailures = 0;
}

/**
 * Gets the path to the segment 0 head proxy file for a session.
 * The proxy is a local MKV file containing the first bytes of the source,
 * used as a fallback when the source is slow to respond.
 */
export function getSegment0ProxyPathValue(session: HlsSession): string {
  return join(session.outputDir, 'source_head_proxy.mkv');
}

/**
 * Scores a media file header to determine if it's a valid media file.
 * Used to validate proxy files before attempting transcode.
 */
export function scoreMediaHeaderValue(header: Buffer | null): number {
  return scoreSharedMediaHeader(header);
}

/**
 * Attempts to read the first N bytes of a media file using multiple fallback
 * strategies:
 * 1. Cached read with read-skip-cache hint ('rs')
 * 2. On Windows: Unbuffered read (direct I/O)
 * 3. Standard cached read ('r')
 *
 * Returns null if all strategies fail or return all zeros (pre-allocated file).
 */
export async function readProxyHeadBytesValue(
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

/**
 * Builds a local segment 0 head proxy file from the source. If a valid proxy
 * already exists and forceRefresh is false, returns the existing path. Otherwise,
 * reads the first maxBytes from the source and writes them to the proxy path.
 *
 * Returns null if the source head is invalid or empty (all zeros).
 */
export async function buildSegment0HeadProxyValue(
  session: HlsSession,
  sourceFilePath: string,
  options?: { forceRefresh?: boolean; maxBytes?: number },
  logger?: Logger,
): Promise<string | null> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const maxBytes = Math.max(
    8 * 1024 * 1024,
    options?.maxBytes ?? 64 * 1024 * 1024,
  );
  const proxyPath = getSegment0ProxyPathValue(session);

  if (forceRefresh) {
    await rm(proxyPath, { force: true }).catch(() => undefined);
    await rm(`${proxyPath}.part`, { force: true }).catch(() => undefined);
  } else {
    try {
      const existing = await stat(proxyPath);
      if (existing.isFile() && existing.size > 0) {
        const existingHeader = await readMediaFileHeaderCached(proxyPath, 16, 'r');
        if (scoreMediaHeaderValue(existingHeader) > 0) {
          return proxyPath;
        }

        await rm(proxyPath, { force: true }).catch(() => undefined);
        await rm(`${proxyPath}.part`, { force: true }).catch(() => undefined);
      }
    } catch {
      // Proxy not present yet; continue.
    }
  }

  const proxyBytes = await readProxyHeadBytesValue(sourceFilePath, maxBytes);
  if (
    !proxyBytes ||
    proxyBytes.length === 0 ||
    proxyBytes.every((byte) => byte === 0)
  ) {
    return null;
  }

  await writeFile(proxyPath, proxyBytes);
  if (logger) {
    logger.warn(
      `Built local segment-0 proxy for session ${session.sessionId} (${proxyBytes.length} bytes${forceRefresh ? ', refreshed' : ''}) from ${sourceFilePath}.`,
    );
  }
  return proxyPath;
}

/**
 * Removes temporary segment 0 files (segment itself, .part intermediate,
 * and proxy files). Best-effort cleanup; errors are swallowed.
 */
export async function resetStartSegmentArtifactsValue(
  session: HlsSession,
  segmentPath: string,
): Promise<void> {
  const proxyPath = getSegment0ProxyPathValue(session);
  await Promise.all(
    [
      rm(segmentPath, { force: true }),
      rm(`${segmentPath}.part`, { force: true }),
      rm(proxyPath, { force: true }),
      rm(`${proxyPath}.part`, { force: true }),
    ].map((task) => task.catch(() => undefined)),
  );
}

/**
 * Attempts to recover segment 0 transcode by building a local proxy file
 * and retrying transcode on it. Tries two proxy strategies:
 * 1. Small proxy (64 MB) without refresh
 * 2. Larger proxy (128 MB) with cache refresh
 *
 * Returns true if transcode succeeded via proxy, false otherwise.
 */
export async function tryRecoverStartSegmentViaProxyValue(
  session: HlsSession,
  segmentPath: string,
  sourceFilePath: string,
  startSeconds: number,
  durationSeconds: number,
  segmentTranscoder: HlsSegmentTranscoder,
  logger: Logger,
): Promise<boolean> {
  const attempts = [
    { forceRefresh: false, maxBytes: 64 * 1024 * 1024 },
    { forceRefresh: true, maxBytes: 128 * 1024 * 1024 },
  ];

  for (const attempt of attempts) {
    const proxyPath = await buildSegment0HeadProxyValue(
      session,
      sourceFilePath,
      attempt,
      logger,
    );
    if (!proxyPath) {
      continue;
    }

    try {
      await segmentTranscoder.ensureSegment({
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
      logger.warn(
        `Segment 0 ${label} transcode still not ready for session ${session.sessionId}: ${proxyMessage}`,
      );

      if (!isRecoverableTranscodeInputErrorValue(proxyMessage)) {
        break;
      }
    }
  }

  return false;
}

/**
 * Records a segment 0 transcode failure and checks if recovery threshold
 * has been exceeded within the recovery window. If threshold is reached,
 * resets startup artifacts and returns true (indicating self-heal was applied).
 * Otherwise returns false (caller should continue retrying).
 */
export async function recordStartSegmentRecoverableFailureValue(
  session: HlsSession,
  segmentPath: string,
  startSegmentRecoverableWindowMs: number,
  maxStartSegmentRecoverableFailures: number,
  logger: Logger,
): Promise<boolean> {
  const now = Date.now();
  const windowStartedAt =
    session.startSegmentRecoverableWindowStartedAtMs ?? 0;

  if (now - windowStartedAt > startSegmentRecoverableWindowMs) {
    session.startSegmentRecoverableWindowStartedAtMs = now;
    session.startSegmentRecoverableFailures = 0;
  }

  const failures = (session.startSegmentRecoverableFailures ?? 0) + 1;
  session.startSegmentRecoverableFailures = failures;
  if (failures < maxStartSegmentRecoverableFailures) {
    return false;
  }

  logger.warn(
    `Segment 0 recoverable failures hit ${failures} within ${startSegmentRecoverableWindowMs}ms for session ${session.sessionId}; resetting startup artifacts.`,
  );
  clearStartSegmentFailureStateValue(session);
  await resetStartSegmentArtifactsValue(session, segmentPath);
  return true;
}
