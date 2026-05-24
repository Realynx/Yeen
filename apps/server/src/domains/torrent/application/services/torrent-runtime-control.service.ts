import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { QbittorrentApiClient } from '../../infrastructure/clients/qbittorrent-api.client';
import {
  buildTorrentOrderModeMessage,
  buildTorrentOrderTogglePlan,
  hasToggleableOrderFlags,
  isSequentialOrderEnforced,
  type TorrentOrderMode,
} from '../helpers/torrent-order-mode-helpers';
import { mapQbTorrentToListItem } from '../helpers/torrent-qbittorrent-mappers';
import { normalizeTorrentHashInput } from '../helpers/torrent-value-normalizers';
import type { TorrentListItem } from '../types/torrent.service.types';

@Injectable()
export class TorrentRuntimeControlService {
  private readonly logger = new Logger(TorrentRuntimeControlService.name);

  constructor(private readonly qbittorrentApiClient: QbittorrentApiClient) {}

  /**
   * Idempotently ensure a torrent is in sequential + first/last-piece-priority
   * mode. Safe to call repeatedly; no-ops when already in the desired state.
   */
  async ensureSequentialDownload(hash: string): Promise<void> {
    const normalizedHash = this.normalizeHash(hash);
    try {
      await this.setTorrentOrderMode(normalizedHash, 'sequential');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(
        `ensureSequentialDownload failed for ${normalizedHash}: ${message}`,
      );
      return;
    }

    // Verify qBittorrent actually applied the flags. Some qBit versions
    // silently drop toggle requests if the torrent transitioned state
    // (e.g. paused -> downloading) in the same window.
    try {
      const observed = await this.getTorrentByHash(normalizedHash);
      if (!observed) {
        this.logger.debug(
          `ensureSequentialDownload: torrent ${normalizedHash} not in qBit after toggle`,
        );
        return;
      }

      if (!isSequentialOrderEnforced(observed)) {
        const seq = observed.sequentialDownload;
        const firstLast = observed.firstLastPiecePriority;
        this.logger.warn(
          `ensureSequentialDownload: qBit did not apply flags for ${normalizedHash} ` +
            `(seq=${seq} firstLast=${firstLast} state=${observed.state} progress=${(observed.progress * 100).toFixed(2)}%)`,
        );
        return;
      }

      this.logger.debug(
        `ensureSequentialDownload: ${normalizedHash} confirmed seq=true firstLast=true ` +
          `progress=${(observed.progress * 100).toFixed(2)}%`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(
        `ensureSequentialDownload verify failed for ${normalizedHash}: ${message}`,
      );
    }
  }

  /**
   * Fetch a single torrent's live status from qBittorrent. Returns null if the
   * torrent is not currently known to qBittorrent.
   */
  async getTorrentByHash(hash: string): Promise<TorrentListItem | null> {
    const normalizedHash = this.normalizeHash(hash);
    const torrents = await this.qbittorrentApiClient.listTorrents({
      hashes: normalizedHash,
    });

    for (const raw of torrents) {
      const item = mapQbTorrentToListItem(raw);
      if (item?.hash === normalizedHash) {
        return item;
      }
    }

    return null;
  }

  async startTorrent(hash: string) {
    const normalizedHash = this.normalizeHash(hash);
    await this.qbittorrentApiClient.startTorrent(normalizedHash);

    return {
      hash: normalizedHash,
      message: 'Torrent started.',
    };
  }

  async stopTorrent(hash: string) {
    const normalizedHash = this.normalizeHash(hash);
    await this.qbittorrentApiClient.stopTorrent(normalizedHash);

    return {
      hash: normalizedHash,
      message: 'Torrent stopped.',
    };
  }

  async restartTorrent(hash: string) {
    const normalizedHash = this.normalizeHash(hash);
    await this.qbittorrentApiClient.stopTorrent(normalizedHash);
    await this.qbittorrentApiClient.startTorrent(normalizedHash);

    return {
      hash: normalizedHash,
      message: 'Torrent restarted.',
    };
  }

  async deleteTorrent(hash: string, deleteFiles: boolean) {
    const normalizedHash = this.normalizeHash(hash);
    await this.qbittorrentApiClient.deleteTorrent(normalizedHash, deleteFiles);

    return {
      hash: normalizedHash,
      deleteFiles,
      message: deleteFiles
        ? 'Torrent and downloaded files deleted.'
        : 'Torrent deleted but files were kept.',
    };
  }

  async setTorrentOrderMode(hash: string, orderMode: TorrentOrderMode) {
    const normalizedHash = this.normalizeHash(hash);
    // The /torrents/properties endpoint does not include seq_dl /
    // f_l_piece_prio in all qBittorrent versions; the /torrents/info list
    // endpoint reliably does.
    const torrent = await this.getTorrentByHash(normalizedHash);

    if (!hasToggleableOrderFlags(torrent)) {
      throw new BadGatewayException(
        'qBittorrent did not return sequential download flags for this torrent.',
      );
    }

    const togglePlan = buildTorrentOrderTogglePlan({
      orderMode,
      sequentialDownload: torrent.sequentialDownload,
      firstLastPiecePriority: torrent.firstLastPiecePriority,
    });

    if (togglePlan.sequentialChanged) {
      await this.qbittorrentApiClient.toggleSequentialDownload(normalizedHash);
    }

    if (togglePlan.firstLastPiecePriorityChanged) {
      await this.qbittorrentApiClient.toggleFirstLastPiecePriority(
        normalizedHash,
      );
    }

    if (
      togglePlan.sequentialChanged ||
      togglePlan.firstLastPiecePriorityChanged
    ) {
      this.logger.log(
        `Enforced ${orderMode} order on ${normalizedHash} ` +
          `(seq toggled=${togglePlan.sequentialChanged}, first/last toggled=${togglePlan.firstLastPiecePriorityChanged}; ` +
          `was seq=${torrent.sequentialDownload} firstLast=${torrent.firstLastPiecePriority})`,
      );
    }

    return {
      hash: normalizedHash,
      orderMode,
      sequentialChanged: togglePlan.sequentialChanged,
      firstLastPiecePriorityChanged: togglePlan.firstLastPiecePriorityChanged,
      message: buildTorrentOrderModeMessage(orderMode),
    };
  }

  private normalizeHash(hash: string): string {
    const normalized = normalizeTorrentHashInput(hash);
    if (!normalized) {
      throw new BadRequestException('Torrent hash is required.');
    }

    return normalized;
  }
}
