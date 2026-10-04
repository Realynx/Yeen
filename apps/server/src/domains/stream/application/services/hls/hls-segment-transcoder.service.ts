import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import {
  buildSegmentFfmpegArgs,
  type VideoEncoder,
} from '../../../infrastructure/hls/hls-ffmpeg-args';

export interface SegmentTranscodeRequest {
  mediaKind: 'video' | 'audio';
  videoEncoder: VideoEncoder;
  softwareVideoPipeline?: boolean;
  sessionId: string;
  segmentIndex: number;
  segmentPath: string;
  ffmpegPath: string;
  sourceFilePath: string;
  startSeconds: number;
  durationSeconds: number;
  audioMapSpecifier: string;
  inputArgs: string[];
  videoArgs: string[];
  audioArgs: string[];
  includeAudio?: boolean;
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

export class SegmentTranscodeCancelledError extends Error {
  constructor(readonly sessionId: string) {
    super(`HLS session ${sessionId} is no longer active.`);
    this.name = 'SegmentTranscodeCancelledError';
  }
}

interface ActiveSegmentTranscode {
  sessionId: string;
  segmentIndex: number;
  mediaKind: 'video' | 'audio';
  videoEncoder: VideoEncoder;
  softwareVideoPipeline: boolean;
  promise: Promise<void>;
  cancel: (reason: Error) => void;
}

interface SegmentPrefetchQueue {
  pending: Map<number, SegmentTranscodeRequest>;
  activeWorkers: number;
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
export class HlsSegmentTranscoder implements OnModuleDestroy {
  private readonly logger = new Logger(HlsSegmentTranscoder.name);
  private readonly inflight = new Map<string, ActiveSegmentTranscode>();
  private readonly cancelledSessionIds = new Set<string>();
  private stopping = false;
  private readonly timeoutMs = 120_000;
  private readonly stderrTailBytes = 4000;
  private readonly maxGlobalInflightJobs = 6;
  private readonly maxSessionInflightJobs = 3;
  private readonly maxCpuInflightJobs = 1;
  private readonly overloadRetryAfterSeconds = 2;
  private readonly maxPrefetchWorkersPerSession = 1;
  private readonly prefetchQueues = new Map<string, SegmentPrefetchQueue>();

  ensureSegment(request: SegmentTranscodeRequest): Promise<void> {
    if (this.stopping || this.cancelledSessionIds.has(request.sessionId)) {
      return Promise.reject(
        new SegmentTranscodeCancelledError(request.sessionId),
      );
    }

    if (existsSync(request.segmentPath)) {
      return Promise.resolve();
    }

    const key = this.jobKey(request.sessionId, request.segmentIndex);
    const existing = this.inflight.get(key);
    if (existing) {
      return existing.promise;
    }

    const totalInflight = this.inflight.size;
    const sessionInflight = this.getInflightCountForSession(request.sessionId);
    const cpuInflight = this.getCpuInflightCount();
    const isCpuVideoJob =
      request.mediaKind === 'video' &&
      (request.videoEncoder === 'cpu' ||
        request.softwareVideoPipeline === true);
    if (
      totalInflight >= this.maxGlobalInflightJobs ||
      sessionInflight >= this.maxSessionInflightJobs ||
      (isCpuVideoJob && cpuInflight >= this.maxCpuInflightJobs)
    ) {
      this.logger.warn(
        `Backpressure: rejecting segment ${request.segmentIndex} for session ${request.sessionId} (global=${totalInflight}/${this.maxGlobalInflightJobs}, session=${sessionInflight}/${this.maxSessionInflightJobs}, cpu=${cpuInflight}/${this.maxCpuInflightJobs}).`,
      );
      throw new SegmentTranscodeQueueOverloadedError(
        this.overloadRetryAfterSeconds,
        totalInflight,
        sessionInflight,
      );
    }

    let cancelJob: (reason: Error) => void = () => {
      // Replaced synchronously by runFfmpeg before it returns.
    };
    const activeJob: ActiveSegmentTranscode = {
      sessionId: request.sessionId,
      segmentIndex: request.segmentIndex,
      mediaKind: request.mediaKind,
      videoEncoder: request.videoEncoder,
      softwareVideoPipeline: request.softwareVideoPipeline === true,
      promise: Promise.resolve(),
      cancel: (reason) => cancelJob(reason),
    };
    const job = this.runFfmpeg(request, (cancel) => {
      cancelJob = cancel;
    }).finally(() => {
      if (this.inflight.get(key) === activeJob) {
        this.inflight.delete(key);
      }
    });

    activeJob.promise = job;
    this.inflight.set(key, activeJob);
    return job;
  }

  prefetchSegments(requests: SegmentTranscodeRequest[]): void {
    if (this.stopping || requests.length === 0) {
      return;
    }

    const sessionId = requests[0].sessionId;
    if (this.cancelledSessionIds.has(sessionId)) {
      return;
    }

    const queue = this.prefetchQueues.get(sessionId) ?? {
      pending: new Map<number, SegmentTranscodeRequest>(),
      activeWorkers: 0,
    };
    for (const request of requests) {
      if (request.sessionId === sessionId) {
        queue.pending.set(request.segmentIndex, request);
      }
    }
    this.prefetchQueues.set(sessionId, queue);
    this.pumpPrefetchQueue(sessionId, queue);
  }

  async cancelForSession(sessionId: string): Promise<void> {
    this.cancelledSessionIds.add(sessionId);
    this.prefetchQueues.delete(sessionId);
    const matchingJobs = [...this.inflight.values()].filter(
      (job) => job.sessionId === sessionId,
    );
    const reason = new SegmentTranscodeCancelledError(sessionId);
    for (const job of matchingJobs) {
      job.cancel(reason);
    }

    await Promise.allSettled(matchingJobs.map((job) => job.promise));
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.prefetchQueues.clear();
    const activeJobs = [...this.inflight.values()];
    for (const job of activeJobs) {
      this.cancelledSessionIds.add(job.sessionId);
      job.cancel(new SegmentTranscodeCancelledError(job.sessionId));
    }

    await Promise.allSettled(activeJobs.map((job) => job.promise));
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

  getCpuInflightCount(): number {
    return [...this.inflight.values()].filter(
      (job) =>
        job.mediaKind === 'video' &&
        (job.videoEncoder === 'cpu' || job.softwareVideoPipeline),
    ).length;
  }

  getQueueLimits(): {
    maxGlobalInflightJobs: number;
    maxSessionInflightJobs: number;
    maxCpuInflightJobs: number;
    overloadRetryAfterSeconds: number;
  } {
    return {
      maxGlobalInflightJobs: this.maxGlobalInflightJobs,
      maxSessionInflightJobs: this.maxSessionInflightJobs,
      maxCpuInflightJobs: this.maxCpuInflightJobs,
      overloadRetryAfterSeconds: this.overloadRetryAfterSeconds,
    };
  }

  private jobKey(sessionId: string, segmentIndex: number): string {
    return `${sessionId}:${segmentIndex}`;
  }

  private pumpPrefetchQueue(
    sessionId: string,
    queue: SegmentPrefetchQueue,
  ): void {
    while (
      queue.activeWorkers < this.maxPrefetchWorkersPerSession &&
      queue.pending.size > 0 &&
      !this.stopping &&
      !this.cancelledSessionIds.has(sessionId)
    ) {
      const nextIndex = Math.min(...queue.pending.keys());
      const request = queue.pending.get(nextIndex);
      queue.pending.delete(nextIndex);
      if (!request) {
        continue;
      }

      queue.activeWorkers += 1;
      void Promise.resolve()
        .then(() => this.ensureSegment(request))
        .catch((error: unknown) => {
          if (
            !(error instanceof SegmentTranscodeCancelledError) &&
            !(error instanceof SegmentTranscodeQueueOverloadedError)
          ) {
            this.logger.debug(
              `Prefetch skipped segment ${request.segmentIndex} for session ${sessionId}: ${asError(error).message}`,
            );
          }
        })
        .finally(() => {
          queue.activeWorkers -= 1;
          if (queue.pending.size === 0 && queue.activeWorkers === 0) {
            if (this.prefetchQueues.get(sessionId) === queue) {
              this.prefetchQueues.delete(sessionId);
            }
            return;
          }
          this.pumpPrefetchQueue(sessionId, queue);
        });
    }
  }

  private runFfmpeg(
    request: SegmentTranscodeRequest,
    registerCancel: (cancel: (reason: Error) => void) => void,
  ): Promise<void> {
    const tempPath = `${request.segmentPath}.part`;
    const args = buildSegmentFfmpegArgs({
      mediaKind: request.mediaKind,
      sourceFilePath: request.sourceFilePath,
      startSeconds: request.startSeconds,
      durationSeconds: request.durationSeconds,
      audioMapSpecifier: request.audioMapSpecifier,
      includeAudio: request.includeAudio,
      inputArgs: request.inputArgs,
      videoArgs: request.videoArgs,
      audioArgs: request.audioArgs,
      outputPath: tempPath,
    });

    return new Promise<void>((resolve, reject) => {
      const child = spawn(request.ffmpegPath, args, { windowsHide: true });
      let stderrBuf = '';
      let settled = false;
      let terminalError: Error | null = null;
      let escalationTimer: NodeJS.Timeout | null = null;
      let terminationDeadline: NodeJS.Timeout | null = null;

      const clearTimers = () => {
        clearTimeout(timeout);
        if (escalationTimer) {
          clearTimeout(escalationTimer);
          escalationTimer = null;
        }
        if (terminationDeadline) {
          clearTimeout(terminationDeadline);
          terminationDeadline = null;
        }
      };

      const settle = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimers();
        action();
      };

      const terminate = (force: boolean) => {
        if (process.platform === 'win32' && child.pid) {
          this.terminateWindowsProcessTree(child);
        } else {
          try {
            child.kill(force ? 'SIGKILL' : 'SIGTERM');
          } catch {
            // The process may already have exited.
          }

          if (!force && !escalationTimer) {
            escalationTimer = setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                // The process may already have exited.
              }
            }, 5000);
            escalationTimer.unref?.();
          }
        }

        if (!terminationDeadline) {
          terminationDeadline = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // The process may already have exited.
            }
            settle(() => {
              void rm(tempPath, { force: true })
                .catch(() => undefined)
                .finally(() =>
                  reject(
                    terminalError ??
                      new Error(
                        `Segment ${request.segmentIndex} termination timed out.`,
                      ),
                  ),
                );
            });
          }, 10_000);
          terminationDeadline.unref?.();
        }
      };

      registerCancel((reason) => {
        terminalError ??= reason;
        terminate(false);
      });

      const timeout = setTimeout(() => {
        terminalError ??= new Error(
          `Segment ${request.segmentIndex} transcode timed out after ${this.timeoutMs}ms`,
        );
        terminate(true);
      }, this.timeoutMs);
      timeout.unref?.();

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > this.stderrTailBytes * 2) {
          stderrBuf = stderrBuf.slice(-this.stderrTailBytes);
        }
      });

      child.on('error', (error) => {
        terminalError ??= error;
        const rejectionError = terminalError;
        settle(() => {
          void rm(tempPath, { force: true })
            .catch(() => undefined)
            .finally(() => reject(rejectionError));
        });
      });

      child.on('close', (code) => {
        settle(() => {
          void (async () => {
            if (terminalError || code !== 0) {
              await rm(tempPath, { force: true }).catch(() => undefined);
              reject(
                terminalError ??
                  new Error(
                    `ffmpeg exited ${code} for segment ${request.segmentIndex}: ${stderrBuf.trim()}`,
                  ),
              );
              return;
            }

            try {
              await rename(tempPath, request.segmentPath);
              if (terminalError) {
                const rejectionError = terminalError;
                await rm(request.segmentPath, { force: true }).catch(
                  () => undefined,
                );
                reject(asError(rejectionError));
                return;
              }
              resolve();
            } catch (renameError) {
              await rm(tempPath, { force: true }).catch(() => undefined);
              reject(
                renameError instanceof Error
                  ? renameError
                  : new Error(String(renameError)),
              );
            }
          })();
        });
      });
    });
  }

  private terminateWindowsProcessTree(
    child: ChildProcessWithoutNullStreams,
  ): void {
    const pid = child.pid;
    if (!pid) {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may already have exited.
      }
      return;
    }

    try {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      const fallback = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // The process may already have exited.
        }
      };
      killer.once('error', fallback);
      killer.once('close', (code) => {
        if (code !== 0) {
          fallback();
        }
      });
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may already have exited.
      }
    }
  }
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}
