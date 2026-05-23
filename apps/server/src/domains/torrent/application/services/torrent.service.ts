import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { AddTorrentDto } from '../dto/add-torrent.dto';
import { KnownTorrentMetadataStore } from '../../infrastructure/stores/known-torrent-metadata.store';
import {
  AddTorrentInput,
  QbittorrentApiClient,
  QbTorrentFile,
} from '../../infrastructure/clients/qbittorrent-api.client';
import { parseTorrentMetadata } from '../../domain/parsers/torrent-metadata.parser';
import {
  applyTorrentPathMappings,
  buildTorrentPathMappings,
  type TorrentPathMapping,
} from '../helpers/torrent-path-and-file-helpers';
import {
  buildKnownTorrentMetadataUpsertEntry,
  cloneKnownTorrentMetadata,
  type KnownTorrentMetadataRecord,
  type KnownTorrentMetadataUpdateInput,
} from '../helpers/torrent-known-metadata-helpers';
import { discoverTorrentHashByTag } from '../helpers/torrent-hash-discovery-helpers';
import {
  buildTorrentOrderModeMessage,
  buildTorrentOrderTogglePlan,
  hasToggleableOrderFlags,
  isSequentialOrderEnforced,
  resolveTorrentOrderModeFromRequest,
  type TorrentOrderMode,
} from '../helpers/torrent-order-mode-helpers';
import {
  extractTorrentPathsFromInfoList,
  mapQbTorrentToListItem,
} from '../helpers/torrent-qbittorrent-mappers';
import {
  normalizeTorrentMediaHint,
  normalizeOptionalInfoHash,
  normalizeTorrentHashInput,
} from '../helpers/torrent-value-normalizers';
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
    private readonly knownTorrentMetadataStore: KnownTorrentMetadataStore,
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
      await this.rememberKnownTorrentMetadata({
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
        await this.setTorrentOrderMode(hash, orderMode);
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
    // (e.g. paused → downloading) in the same window. Logging the observed
    // post-state lets us catch this without re-enabling verbose tracing.
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
      } else {
        this.logger.debug(
          `ensureSequentialDownload: ${normalizedHash} confirmed seq=true firstLast=true ` +
            `progress=${(observed.progress * 100).toFixed(2)}%`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(
        `ensureSequentialDownload verify failed for ${normalizedHash}: ${message}`,
      );
    }
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

  async getTorrentPaths(hash: string): Promise<TorrentPaths> {
    const normalizedHash = this.normalizeHash(hash);

    // content_path is only available in /api/v2/torrents/info (the list endpoint),
    // NOT in /api/v2/torrents/properties. Query info first, fall back to properties
    // for save_path if the torrent isn't listed yet.
    const torrentInfoList = await this.qbittorrentApiClient.listTorrents({
      hashes: normalizedHash,
    });

    const torrentPaths = extractTorrentPathsFromInfoList(torrentInfoList);
    const contentPath = torrentPaths.contentPath;
    let savePath = torrentPaths.savePath;

    // Fall back to properties endpoint for save_path if the list returned nothing.
    // The properties call may fail (404) when qBittorrent no longer knows the
    // torrent at all; in that case rely solely on the persisted metadata cache
    // below instead of bubbling the error up.
    if (!savePath) {
      try {
        const properties =
          await this.qbittorrentApiClient.getTorrentProperties(normalizedHash);
        savePath = properties.save_path?.trim() || null;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug(
          `qBittorrent properties lookup failed for ${normalizedHash}: ${message}`,
        );
      }
    }

    if (savePath || contentPath) {
      await this.rememberKnownTorrentMetadata({
        hash: normalizedHash,
        titleHint: null,
        mediaHint: null,
        savePath,
        contentPath,
        files: [],
      });
    }

    const resolvedSavePath =
      savePath ?? (await this.getKnownTorrentSavePath(normalizedHash));
    const resolvedContentPath =
      contentPath ?? (await this.getKnownTorrentContentPath(normalizedHash));

    const mappings = await this.loadPathMappings();
    return {
      savePath: applyTorrentPathMappings(resolvedSavePath, mappings),
      contentPath: applyTorrentPathMappings(resolvedContentPath, mappings),
    };
  }

  /**
   * Translate a path reported by qBittorrent (which may use container/POSIX
   * conventions) into a path on the host where Yeen is running, using the
   * user-configured prefix mappings. Returns the input unchanged if no mapping
   * matches.
   */
  async translateRemotePath(input: string | null): Promise<string | null> {
    if (!input) return input;
    const mappings = await this.loadPathMappings();
    return applyTorrentPathMappings(input, mappings);
  }

  private async loadPathMappings(): Promise<TorrentPathMapping[]> {
    const settings = await this.systemSettingsService.getSettings();
    return buildTorrentPathMappings(settings.qbittorrentPathMappings ?? []);
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
    const normalizedHash = this.normalizeHash(hash);
    const known = await this.getKnownTorrentMetadata(normalizedHash);
    if (!known) {
      return [];
    }

    return known.files.map((file) => ({ ...file }));
  }

  async getKnownTorrentSavePath(hash: string): Promise<string | null> {
    const normalizedHash = this.normalizeHash(hash);
    return (
      (await this.getKnownTorrentMetadata(normalizedHash))?.savePath ?? null
    );
  }

  async getKnownTorrentContentPath(hash: string): Promise<string | null> {
    const normalizedHash = this.normalizeHash(hash);
    return (
      (await this.getKnownTorrentMetadata(normalizedHash))?.contentPath ?? null
    );
  }

  async getKnownTorrentTitleHint(hash: string): Promise<string | null> {
    const normalizedHash = this.normalizeHash(hash);
    return (
      (await this.getKnownTorrentMetadata(normalizedHash))?.titleHint ?? null
    );
  }

  async getKnownTorrentMediaHint(
    hash: string,
  ): Promise<TorrentMediaHint | null> {
    const normalizedHash = this.normalizeHash(hash);
    const hint = (await this.getKnownTorrentMetadata(normalizedHash))
      ?.mediaHint;
    if (!hint) {
      return null;
    }

    return {
      ...hint,
      tags: [...hint.tags],
    };
  }

  async setKnownTorrentMediaHint(
    hash: string,
    hint: Partial<TorrentMediaHint> | null,
  ): Promise<void> {
    const normalizedHash = this.normalizeHash(hash);
    const normalizedHint = normalizeTorrentMediaHint(hint);

    await this.rememberKnownTorrentMetadata({
      hash: normalizedHash,
      titleHint: null,
      mediaHint: normalizedHint,
      savePath: null,
      contentPath: null,
      files: [],
    });
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
    // endpoint reliably does. Fetch the single-torrent entry from there.
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

  private async getKnownTorrentMetadata(
    hash: string,
  ): Promise<KnownTorrentMetadataRecord | null> {
    const persisted = await this.knownTorrentMetadataStore.get(hash);
    return cloneKnownTorrentMetadata(persisted);
  }

  private async rememberKnownTorrentMetadata(
    input: KnownTorrentMetadataUpdateInput,
  ): Promise<void> {
    const normalizedHash = this.normalizeHash(input.hash);
    const existing = await this.knownTorrentMetadataStore.get(normalizedHash);

    await this.knownTorrentMetadataStore.upsert(
      buildKnownTorrentMetadataUpsertEntry({
        normalizedHash,
        existing,
        update: input,
        nowMs: Date.now(),
      }),
    );
  }
}


