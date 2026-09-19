import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContinuousAudioHlsArgs } from '../../../infrastructure/hls/hls-ffmpeg-args';

interface ContinuousAudioRequest {
  sessionId: string;
  ffmpegPath: string;
  sourceFilePath: string;
  outputDir: string;
  manifestFileName: string;
  audioMapSpecifier: string;
  audioArgs: string[];
  segmentSeconds: number;
}

interface ActiveAudioTranscode {
  child: ChildProcessWithoutNullStreams;
  completion: Promise<void>;
}

@Injectable()
export class HlsContinuousAudioTranscoder implements OnModuleDestroy {
  private readonly logger = new Logger(HlsContinuousAudioTranscoder.name);
  private readonly active = new Map<string, ActiveAudioTranscode>();
  private readonly startupTimeoutMs = 15_000;

  async start(request: ContinuousAudioRequest): Promise<void> {
    await this.cancelForSession(request.sessionId);
    const manifestPath = join(request.outputDir, request.manifestFileName);
    const firstSegmentPath = join(request.outputDir, 'audio_00000.ts');
    const args = buildContinuousAudioHlsArgs({
      sourceFilePath: request.sourceFilePath,
      audioMapSpecifier: request.audioMapSpecifier,
      audioArgs: request.audioArgs,
      segmentSeconds: request.segmentSeconds,
      segmentPattern: join(request.outputDir, 'audio_%05d.ts'),
      manifestPath,
    });
    const child = spawn(request.ffmpegPath, args, { windowsHide: true });
    const completion = this.monitorProcess(request.sessionId, child);
    // A rendition may fail after startup while no caller is awaiting completion.
    // Keep the original promise for startup/cancellation while also marking
    // late failures as handled so Node does not emit an unhandled rejection.
    void completion.catch(() => undefined);
    this.active.set(request.sessionId, { child, completion });

    try {
      await this.waitForFirstSegment(
        request.sessionId,
        manifestPath,
        firstSegmentPath,
        completion,
      );
    } catch (error) {
      await this.cancelForSession(request.sessionId);
      throw error;
    }
  }

  async cancelForSession(sessionId: string): Promise<void> {
    const active = this.active.get(sessionId);
    if (!active) return;
    this.active.delete(sessionId);
    try {
      active.child.kill('SIGTERM');
    } catch {
      // The process may already have exited.
    }
    await active.completion.catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.active.keys()].map((sessionId) =>
        this.cancelForSession(sessionId),
      ),
    );
  }

  private monitorProcess(
    sessionId: string,
    child: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-4000);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        if (this.active.get(sessionId)?.child === child) {
          this.active.delete(sessionId);
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `Continuous audio transcode exited ${code}: ${stderr.trim()}`,
          ),
        );
      });
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Continuous audio transcode failed for ${sessionId}: ${message}`,
      );
      throw error;
    });
  }

  private async waitForFirstSegment(
    sessionId: string,
    manifestPath: string,
    firstSegmentPath: string,
    completion: Promise<void>,
  ): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.startupTimeoutMs) {
      if (existsSync(manifestPath) && existsSync(firstSegmentPath)) return;
      const outcome = await Promise.race([
        completion.then(() => 'completed' as const),
        new Promise<'waiting'>((resolve) =>
          setTimeout(() => resolve('waiting'), 25),
        ),
      ]);
      if (outcome === 'completed') {
        throw new Error(
          'Continuous audio transcode ended before its first segment was ready.',
        );
      }
    }
    throw new Error('Continuous audio rendition startup timed out.');
  }
}
