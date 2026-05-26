import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { TorrentService } from '../../../../torrent/application/services/torrent.service';
import { MediaScanStore } from '../../../infrastructure/stores/media-scan.store';
import { MediaTorrentIntakeCandidateService } from './media-torrent-intake-candidate.service';

@Injectable()
export class MediaTorrentIntakePollingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly automaticTorrentIntakePollMs = 20_000;
  private readonly automaticTorrentIntakeBatchSize = 8;
  private readonly automaticTorrentRefreshCooldownMs = 60_000;
  private readonly logger = new Logger(MediaTorrentIntakePollingService.name);
  private automaticTorrentIntakeTimer: NodeJS.Timeout | null = null;
  private automaticTorrentIntakeRunning = false;
  private automaticTorrentIntakeStopping = false;
  private activePollPromise: Promise<void> | null = null;

  constructor(
    private readonly mediaScanStore: MediaScanStore,
    private readonly torrentService: TorrentService,
    private readonly mediaTorrentIntakeCandidateService: MediaTorrentIntakeCandidateService,
  ) {}

  onModuleInit(): void {
    this.automaticTorrentIntakeStopping = false;
    this.automaticTorrentIntakeTimer = setInterval(() => {
      this.queueAutomaticTorrentIntakePoll();
    }, this.automaticTorrentIntakePollMs);

    this.automaticTorrentIntakeTimer.unref?.();
    this.queueAutomaticTorrentIntakePoll();
  }

  async onModuleDestroy(): Promise<void> {
    this.automaticTorrentIntakeStopping = true;
    this.stopAutomaticTorrentIntakePolling();

    if (this.activePollPromise) {
      await this.activePollPromise;
    }
  }

  private queueAutomaticTorrentIntakePoll(): void {
    if (this.automaticTorrentIntakeStopping) {
      return;
    }

    const nextPollPromise = this.runAutomaticTorrentIntakePoll();
    const trackedPromise = nextPollPromise.finally(() => {
      if (this.activePollPromise === trackedPromise) {
        this.activePollPromise = null;
      }
    });
    this.activePollPromise = trackedPromise;
  }

  private stopAutomaticTorrentIntakePolling(): void {
    if (!this.automaticTorrentIntakeTimer) {
      return;
    }

    clearInterval(this.automaticTorrentIntakeTimer);
    this.automaticTorrentIntakeTimer = null;
  }

  private async runAutomaticTorrentIntakePoll(): Promise<void> {
    if (this.automaticTorrentIntakeStopping) {
      return;
    }

    if (this.automaticTorrentIntakeRunning) {
      return;
    }

    if (this.mediaScanStore.get().status === 'running') {
      return;
    }

    this.automaticTorrentIntakeRunning = true;

    try {
      const listResult = await this.torrentService.listTorrents();
      if (this.automaticTorrentIntakeStopping) {
        return;
      }

      const torrents = Array.isArray(listResult.items) ? listResult.items : [];
      if (torrents.length === 0) {
        return;
      }

      const candidates = torrents
        .filter(
          (item) =>
            typeof item.hash === 'string' && item.hash.trim().length > 0,
        )
        .sort((left, right) => {
          const leftComplete = left.progress >= 0.999;
          const rightComplete = right.progress >= 0.999;

          if (leftComplete !== rightComplete) {
            return leftComplete ? 1 : -1;
          }

          if (left.progress !== right.progress) {
            return right.progress - left.progress;
          }

          return left.name.localeCompare(right.name, undefined, {
            sensitivity: 'base',
          });
        })
        .slice(0, this.automaticTorrentIntakeBatchSize);

      for (const candidate of candidates) {
        if (this.automaticTorrentIntakeStopping) {
          break;
        }

        const normalizedHash = candidate.hash.trim().toLowerCase();
        if (!normalizedHash) {
          continue;
        }

        try {
          await this.mediaTorrentIntakeCandidateService.processAutomaticTorrentIntakeCandidate(
            normalizedHash,
            this.automaticTorrentRefreshCooldownMs,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.debug(
            `Automatic intake failed for torrent ${normalizedHash}: ${message}`,
          );
        }
      }
    } catch (error) {
      if (!this.automaticTorrentIntakeStopping) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Automatic torrent intake poll failed: ${message}`);
      }
    } finally {
      this.automaticTorrentIntakeRunning = false;
    }
  }
}
