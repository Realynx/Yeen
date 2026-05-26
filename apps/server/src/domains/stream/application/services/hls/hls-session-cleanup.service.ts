import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { HlsSessionStore } from '../../../infrastructure/stores/hls-session.store';

@Injectable()
export class HlsSessionCleanupService implements OnModuleInit, OnModuleDestroy {
  private static readonly STALE_SESSION_MAX_IDLE_MS = 2 * 60 * 60 * 1000;
  private static readonly STALE_SESSION_SWEEP_MS = 5 * 60 * 1000;
  private readonly logger = new Logger(HlsSessionCleanupService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly hlsSessionStore: HlsSessionStore) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      this.cleanupStaleHlsSessions();
    }, HlsSessionCleanupService.STALE_SESSION_SWEEP_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private cleanupStaleHlsSessions(): void {
    const removed = this.hlsSessionStore.deleteStale(
      HlsSessionCleanupService.STALE_SESSION_MAX_IDLE_MS,
    );

    if (removed.length > 0) {
      this.logger.log(`Cleaned up ${removed.length} stale HLS session(s).`);
    }
  }
}
