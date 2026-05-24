import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { AddTorrentDto } from '../dto/add-torrent.dto';
import {
  AddTorrentInput,
  QbittorrentApiClient,
  QbTorrentFile,
} from '../../infrastructure/clients/qbittorrent-api.client';
import { parseTorrentMetadata } from '../../domain/parsers/torrent-metadata.parser';
import { discoverTorrentHashByTag } from '../helpers/torrent-hash-discovery-helpers';
import {
  resolveTorrentOrderModeFromRequest,
  type TorrentOrderMode,
} from '../helpers/torrent-order-mode-helpers';
import { mapQbTorrentToListItem } from '../helpers/torrent-qbittorrent-mappers';
import {
  normalizeOptionalInfoHash,
  normalizeTorrentHashInput,
} from '../helpers/torrent-value-normalizers';
import { TorrentPathResolutionService } from './torrent-path-resolution.service';
import { TorrentKnownMetadataService } from './torrent-known-metadata.service';
import { TorrentRuntimeControlService } from './torrent-runtime-control.service';
import type {
  TorrentFileHint as SharedTorrentFileHint,
  TorrentListItem as SharedTorrentListItem,
  TorrentMediaHint as SharedTorrentMediaHint,
  TorrentPaths as SharedTorrentPaths,
} from '../types/torrent.service.types';

export type TorrentListItem = SharedTorrentListItem;
export type TorrentFileHint = SharedTorrentFileHint;
export type TorrentMediaHint = SharedTorrentMediaHint;
export type TorrentPaths = SharedTorrentPaths;

@Injectable()
export class TorrentService {
  private readonly logger = new Logger(TorrentService.name);
  private static readonly HASH_DISCOVERY_TIMEOUT_MS = 8000;
  private static readonly HASH_DISCOVERY_POLL_MS = 250;

  constructor(
    private readonly qbittorrentApiClient: QbittorrentApiClient,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly torrentPathResolutionService: TorrentPathResolutionService,
    private readonly torrentKnownMetadataService: TorrentKnownMetadataService,
    private readonly torrentRuntimeControlService: TorrentRuntimeControlService,
  ) {}

  async listTorrents() {
    const torrents = await this.qbittorrentApiClient.listTorrents();

    const items = torrents
      .map((item) => mapQbTorrentToListItem(item))
      .filter((item): item is TorrentListItem => item !== null);

    return { items };
  }

  async addTorrent(
    dto: AddTorrentDto,
    torrentFile?: { buffer: Buffer; originalname: string },
  ) {
    const normalizedMagnetLink = dto.magnetLink?.trim() || '';
    const hasMagnetLink = normalizedMagnetLink.length > 0;
    const hasTorrentFile = Boolean(torrentFile?.buffer?.length);

    const parsedTorrentMetadata = hasTorrentFile
      ? parseTorrentMetadata(torrentFile!.buffer)
      : null;
    const hashFromTorrentFile = normalizeOptionalInfoHash(
      parsedTorrentMetadata?.infoHash,
    );

    if (!hasMagnetLink && !hasTorrentFile) {
      throw new BadRequestException(
        'Provide either a magnet link or a .torrent file.',
      );
    }

    const orderMode = await this.resolveOrderMode(dto);
    const traceTag = `yeen-trace-${randomUUID()}`;

    const input: AddTorrentInput = {
      magnetLink: hasMagnetLink ? normalizedMagnetLink : undefined,
      savePath: dto.savePath?.trim() || undefined,
      paused: dto.paused ?? false,
      seedAfterDownload: dto.seedAfterDownload,
      orderMode,
      tags: traceTag,
      torrentFile: hasTorrentFile
        ? {
            buffer: torrentFile!.buffer,
            fileName: torrentFile!.originalname || 'upload.torrent',
          }
        : undefined,
    };

    await this.qbittorrentApiClient.addTorrent(input);

    const hash =
      hashFromTorrentFile ?? (await this.discoverHashByTag(traceTag));

    if (hash) {
      await this.torrentKnownMetadataService.rememberMetadata({
        hash,
        titleHint: parsedTorrentMetadata?.titleHint ?? null,
        mediaHint: null,
        savePath: dto.savePath?.trim() || null,
        contentPath: null,
        files: parsedTorrentMetadata?.files ?? [],
      });

      // Some qBittorrent versions silently ignore the add-time
      // sequentialDownload / firstLastPiecePrio params, which leaves the
      // first piece un-prioritized and prevents an MKV/MP4 header probe
      // from succeeding until much later. Explicitly enforce the requested
      // order mode now so the prepare page can index quickly.
      try {
        await this.torrentRuntimeControlService.setTorrentOrderMode(
          hash,
          orderMode,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to enforce ${orderMode} order on torrent ${hash}: ${message}`,
        );
      }
    }

    return {
      message: 'Torrent added successfully.',
      orderMode,
      intent: dto.intent ?? null,
      hash,
    };
  }

  /**
   * Idempotently ensure a torrent is in sequential + first/last-piece-priority
   * mode. Safe to call repeatedly; no-ops when already in the desired state.
   * Used by the prepare-page status poll to recover torrents that were added
   * before sequential enforcement landed (or whose add-time params were
   * silently dropped by qBittorrent).
   */
  async ensureSequentialDownload(hash: string): Promise<void> {
    await this.torrentRuntimeControlService.ensureSequentialDownload(hash);
  }

  async getTorrentFiles(hash: string): Promise<QbTorrentFile[]> {
    const normalizedHash = this.normalizeHash(hash);
    return this.qbittorrentApiClient.getTorrentFiles(normalizedHash);
  }

  /**
   * Fetch a single torrent's live status from qBittorrent. Returns null if the
   * torrent is not currently known to qBittorrent (for example, it was removed
   * or has not yet been added).
   */
  async getTorrentByHash(hash: string): Promise<TorrentListItem | null> {
    return this.torrentRuntimeControlService.getTorrentByHash(hash);
  }

  async getTorrentPaths(hash: string): Promise<TorrentPaths> {
    return this.torrentPathResolutionService.getTorrentPaths(hash);
  }

  /**
   * Translate a path reported by qBittorrent (which may use container/POSIX
   * conventions) into a path on the host where Yeen is running, using the
   * user-configured prefix mappings. Returns the input unchanged if no mapping
   * matches.
   */
  async translateRemotePath(input: string | null): Promise<string | null> {
    return this.torrentPathResolutionService.translateRemotePath(input);
  }

  async getTorrentSavePath(hash: string): Promise<string | null> {
    const paths = await this.getTorrentPaths(hash);
    return paths.savePath;
  }

  async getTorrentContentPath(hash: string): Promise<string | null> {
    const paths = await this.getTorrentPaths(hash);
    return paths.contentPath;
  }

  async getKnownTorrentFiles(hash: string): Promise<TorrentFileHint[]> {
    return this.torrentKnownMetadataService.getFiles(hash);
  }

  async getKnownTorrentSavePath(hash: string): Promise<string | null> {
    return this.torrentKnownMetadataService.getSavePath(hash);
  }

  async getKnownTorrentContentPath(hash: string): Promise<string | null> {
    return this.torrentKnownMetadataService.getContentPath(hash);
  }

  async getKnownTorrentTitleHint(hash: string): Promise<string | null> {
    return this.torrentKnownMetadataService.getTitleHint(hash);
  }

  async getKnownTorrentMediaHint(
    hash: string,
  ): Promise<TorrentMediaHint | null> {
    return this.torrentKnownMetadataService.getMediaHint(hash);
  }

  async setKnownTorrentMediaHint(
    hash: string,
    hint: Partial<TorrentMediaHint> | null,
  ): Promise<void> {
    await this.torrentKnownMetadataService.setMediaHint(hash, hint);
  }

  private async discoverHashByTag(tag: string): Promise<string | null> {
    const discoveredHash = await discoverTorrentHashByTag({
      tag,
      timeoutMs: TorrentService.HASH_DISCOVERY_TIMEOUT_MS,
      pollIntervalMs: TorrentService.HASH_DISCOVERY_POLL_MS,
      listTorrentsByTag: (nextTag) =>
        this.qbittorrentApiClient.listTorrents({ tag: nextTag }),
      extractHash: (raw) => mapQbTorrentToListItem(raw)?.hash ?? null,
      onListError: (error) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to discover qBittorrent hash for tag ${tag}: ${message}`,
        );
      },
    });

    if (discoveredHash) {
      return discoveredHash;
    }

    this.logger.warn(
      `Timed out discovering qBittorrent hash for tag ${tag} after ${TorrentService.HASH_DISCOVERY_TIMEOUT_MS}ms.`,
    );
    return null;
  }

  async startTorrent(hash: string) {
    return this.torrentRuntimeControlService.startTorrent(hash);
  }

  async stopTorrent(hash: string) {
    return this.torrentRuntimeControlService.stopTorrent(hash);
  }

  async restartTorrent(hash: string) {
    return this.torrentRuntimeControlService.restartTorrent(hash);
  }

  async deleteTorrent(hash: string, deleteFiles: boolean) {
    return this.torrentRuntimeControlService.deleteTorrent(hash, deleteFiles);
  }

  async setTorrentOrderMode(hash: string, orderMode: TorrentOrderMode) {
    return this.torrentRuntimeControlService.setTorrentOrderMode(
      hash,
      orderMode,
    );
  }

  private async resolveOrderMode(
    dto: AddTorrentDto,
  ): Promise<TorrentOrderMode> {
    const requestedOrderMode = resolveTorrentOrderModeFromRequest({
      orderMode: dto.orderMode,
      intent: dto.intent,
    });
    if (requestedOrderMode) {
      return requestedOrderMode;
    }

    const settings = await this.systemSettingsService.getSettings();
    return settings.qbittorrentDefaultOrderMode;
  }

  private normalizeHash(hash: string): string {
    const normalized = normalizeTorrentHashInput(hash);
    if (!normalized) {
      throw new BadRequestException('Torrent hash is required.');
    }

    return normalized;
  }
}
