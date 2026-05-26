import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { buildSegmentFfmpegArgs } from '../../../infrastructure/hls/hls-ffmpeg-args';

export interface SegmentTranscodeRequest {
  sessionId: string;
  segmentIndex: number;
  segmentPath: string;
  ffmpegPath: string;
  sourceFilePath: string;
  startSeconds: number;
  durationSeconds: number;
  audioMapSpecifier: string;
  videoArgs: string[];
  audioArgs: string[];
}

export class SegmentTranscodeQueueOverloadedError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly totalInflight: number,
    readonly sessionInflight: number,
  ) {
    super('Segment transcode queue is overloaded.');
    this.name = 'SegmentTranscodeQueueOverloadedError';
  }
}

/**
 * Owns ffmpeg process management for per-segment HLS transcoding.
 *
 * Single responsibility: turn a `SegmentTranscodeRequest` into an on-disk
 * segment file. Concurrent requests for the same `(sessionId, segmentIndex)`
 * are deduplicated; partial output is never observable because the file is
 * written to `.part` first and atomically renamed.
 */
@Injectable()
export class HlsSegmentTranscoder {
  private readonly logger = new Logger(HlsSegmentTranscoder.name);
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly timeoutMs = 120_000;
  private readonly stderrTailBytes = 4000;
  private readonly maxGlobalInflightJobs = 12;
  private readonly maxSessionInflightJobs = 8;
  private readonly overloadRetryAfterSeconds = 2;

  ensureSegment(request: SegmentTranscodeRequest): Promise<void> {
    if (existsSync(request.segmentPath)) {
      return Promise.resolve();
    }

    const key = this.jobKey(request.sessionId, request.segmentIndex);
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    const totalInflight = this.inflight.size;
    const sessionInflight = this.getInflightCountForSession(request.sessionId);
    if (
      totalInflight >= this.maxGlobalInflightJobs ||
      sessionInflight >= this.maxSessionInflightJobs
    ) {
      this.logger.warn(
        `Backpressure: rejecting segment ${request.segmentIndex} for session ${request.sessionId} (global=${totalInflight}/${this.maxGlobalInflightJobs}, session=${sessionInflight}/${this.maxSessionInflightJobs}).`,
      );
      throw new SegmentTranscodeQueueOverloadedError(
        this.overloadRetryAfterSeconds,
        totalInflight,
        sessionInflight,
      );
    }

    const job = this.runFfmpeg(request)
      .catch((error: unknown) => {
        // Don't leak a partial file across retries.
        void rm(request.segmentPath, { force: true }).catch(() => undefined);
        throw error;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, job);
    return job;
  }

  cancelForSession(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of [...this.inflight.keys()]) {
      if (key.startsWith(prefix)) {
        this.inflight.delete(key);
      }
    }
  }

  getInflightSegmentIndices(sessionId: string): number[] {
    const prefix = `${sessionId}:`;
    const indices: number[] = [];

    for (const key of this.inflight.keys()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const rawIndex = key.slice(prefix.length);
      const parsedIndex = Number(rawIndex);
      if (Number.isInteger(parsedIndex) && parsedIndex >= 0) {
        indices.push(parsedIndex);
      }
    }

    return indices.sort((left, right) => left - right);
  }

  getInflightCount(): number {
    return this.inflight.size;
  }

  getInflightCountForSession(sessionId: string): number {
    const prefix = `${sessionId}:`;
    let count = 0;

    for (const key of this.inflight.keys()) {
      if (key.startsWith(prefix)) {
        count += 1;
      }
    }

    return count;
  }

  getQueueLimits(): {
    maxGlobalInflightJobs: number;
    maxSessionInflightJobs: number;
    overloadRetryAfterSeconds: number;
  } {
    return {
      maxGlobalInflightJobs: this.maxGlobalInflightJobs,
      maxSessionInflightJobs: this.maxSessionInflightJobs,
      overloadRetryAfterSeconds: this.overloadRetryAfterSeconds,
    };
  }

  private jobKey(sessionId: string, segmentIndex: number): string {
    return `${sessionId}:${segmentIndex}`;
  }

  private runFfmpeg(request: SegmentTranscodeRequest): Promise<void> {
    const tempPath = `${request.segmentPath}.part`;
    const args = buildSegmentFfmpegArgs({
      sourceFilePath: request.sourceFilePath,
      startSeconds: request.startSeconds,
      durationSeconds: request.durationSeconds,
      audioMapSpecifier: request.audioMapSpecifier,
      videoArgs: request.videoArgs,
      audioArgs: request.audioArgs,
      outputPath: tempPath,
    });

    return new Promise<void>((resolve, reject) => {
      const child = spawn(request.ffmpegPath, args, { windowsHide: true });
      let stderrBuf = '';
      let settled = false;

      const finalize = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        action();
      };

      const timeout = setTimeout(() => {
        finalize(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(
            new Error(
              `Segment ${request.segmentIndex} transcode timed out after ${this.timeoutMs}ms`,
            ),
          );
        });
      }, this.timeoutMs);

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > this.stderrTailBytes * 2) {
          stderrBuf = stderrBuf.slice(-this.stderrTailBytes);
        }
      });

      child.on('error', (error) => {
        finalize(() => reject(error));
      });

      child.on('close', (code) => {
        finalize(() => {
          if (code !== 0) {
            reject(
              new Error(
                `ffmpeg exited ${code} for segment ${request.segmentIndex}: ${stderrBuf.trim()}`,
              ),
            );
            return;
          }

          rename(tempPath, request.segmentPath)
            .then(() => resolve())
            .catch((renameError: unknown) => {
              reject(
                renameError instanceof Error
                  ? renameError
                  : new Error(String(renameError)),
              );
            });
        });
      });
    });
  }
}
