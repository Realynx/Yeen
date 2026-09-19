import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HlsSessionStore } from '../../../infrastructure/stores/hls-session.store';
import { HlsSegmentTranscoder } from './hls-segment-transcoder.service';
import { selectHlsSessionsForEvictionValue } from './hls-cache-budget.helper';
import { HlsContinuousAudioTranscoder } from './hls-continuous-audio-transcoder.service';

@Injectable()
export class HlsSessionCleanupService implements OnModuleInit, OnModuleDestroy {
  private static readonly STALE_SESSION_MAX_IDLE_MS = 2 * 60 * 1000;
  private static readonly STALE_SESSION_SWEEP_MS = 30 * 1000;
  private static readonly MAX_HLS_CACHE_BYTES = 1536 * 1024 * 1024;
  private readonly logger = new Logger(HlsSessionCleanupService.name);
  private interval: NodeJS.Timeout | null = null;
  private activeCleanupPromise: Promise<void> | null = null;

  constructor(
    private readonly hlsSessionStore: HlsSessionStore,
    private readonly segmentTranscoder: HlsSegmentTranscoder,
    private readonly continuousAudioTranscoder: HlsContinuousAudioTranscoder,
  ) {}

  onModuleInit(): void {
    void this.startCleanupSweep();
    this.interval = setInterval(() => {
      void this.startCleanupSweep();
    }, HlsSessionCleanupService.STALE_SESSION_SWEEP_MS);
    this.interval.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    await this.activeCleanupPromise;
  }

  prepareForSessionStart(): Promise<void> {
    return this.startCleanupSweep();
  }

  private startCleanupSweep(): Promise<void> {
    if (this.activeCleanupPromise) {
      return this.activeCleanupPromise;
    }

    const cleanupPromise = this.cleanupStaleHlsSessions().finally(() => {
      if (this.activeCleanupPromise === cleanupPromise) {
        this.activeCleanupPromise = null;
      }
    });
    this.activeCleanupPromise = cleanupPromise;
    return cleanupPromise;
  }

  private async cleanupStaleHlsSessions(): Promise<void> {
    const staleSessions = this.hlsSessionStore.deleteStale(
      HlsSessionCleanupService.STALE_SESSION_MAX_IDLE_MS,
    );
    await this.removeSessions(staleSessions);

    if (staleSessions.length > 0) {
      this.logger.log(
        `Cleaned up ${staleSessions.length} stale HLS session(s).`,
      );
    }

    await this.enforceCacheBudget();
  }

  private async enforceCacheBudget(): Promise<void> {
    const sessions = this.hlsSessionStore.all();
    const sessionBytes = new Map<string, number>();
    await Promise.all(
      sessions.map(async (session) => {
        sessionBytes.set(
          session.sessionId,
          await this.directoryBytes(session.outputDir),
        );
      }),
    );
    const evicted = selectHlsSessionsForEvictionValue({
      sessions,
      sessionBytes,
      maxBytes: HlsSessionCleanupService.MAX_HLS_CACHE_BYTES,
    });
    for (const session of evicted) {
      this.hlsSessionStore.delete(session.sessionId);
    }
    await this.removeSessions(evicted);

    if (evicted.length > 0) {
      this.logger.warn(
        `Evicted ${evicted.length} least-recently-used HLS session(s) to keep the cache within ${HlsSessionCleanupService.MAX_HLS_CACHE_BYTES} bytes.`,
      );
    }
  }

  private async removeSessions(
    sessions: ReturnType<HlsSessionStore['all']>,
  ): Promise<void> {
    for (const session of sessions) {
      await this.segmentTranscoder.cancelForSession(session.sessionId);
      await this.continuousAudioTranscoder.cancelForSession(session.sessionId);
      await rm(session.outputDir, { recursive: true, force: true }).catch(
        (error: unknown) => {
          this.logger.warn(
            `Failed to remove stale HLS output ${session.outputDir}: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }
  }

  private async directoryBytes(outputDir: string): Promise<number> {
    try {
      const entries = await readdir(outputDir, { withFileTypes: true });
      const sizes = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => (await stat(join(outputDir, entry.name))).size),
      );
      return sizes.reduce((total, size) => total + size, 0);
    } catch {
      return 0;
    }
  }
}
