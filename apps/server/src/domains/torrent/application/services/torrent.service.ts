import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { AddTorrentDto } from '../dto/add-torrent.dto.ts/add-torrent.dto';
import { KnownTorrentMetadataStore } from '../../infrastructure/stores/known-torrent-metadata.store';
import {
  AddTorrentInput,
  QbittorrentApiClient,
  QbTorrentFile,
} from '../../infrastructure/clients/qbittorrent-api.client';
import {
  parseTorrentMetadata,
  type TorrentMetadataFileHint,
} from '../../domain/parsers/torrent-metadata.parser';
import type {
  TorrentFileHint as SharedTorrentFileHint,
  TorrentMediaHint as SharedTorrentMediaHint,
} from '../types/torrent.service.types';

export interface TorrentListItem {
  hash: string;
  name: string;
  state: string;
  progress: number;
  etaSeconds: number;
  downloadRate: number;
  uploadRate: number;
  sizeBytes: number;
  completedBytes: number;
  savePath: string | null;
  sequentialDownload: boolean | null;
  firstLastPiecePriority: boolean | null;
}

export type TorrentFileHint = SharedTorrentFileHint;
export type TorrentMediaHint = SharedTorrentMediaHint;

export interface TorrentPaths {
  savePath: string | null;
  contentPath: string | null;
}

interface KnownTorrentMetadata {
  hash: string;
  titleHint: string | null;
  mediaHint: TorrentMediaHint | null;
  savePath: string | null;
  contentPath: string | null;
  files: TorrentFileHint[];
  updatedAtMs: number;
}

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
      .map((item) => this.toTorrentListItem(item))
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
    const hashFromTorrentFile = this.normalizeOptionalHash(
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
      const seq = observed.sequentialDownload;
      const firstLast = observed.firstLastPiecePriority;
      if (seq !== true || firstLast !== true) {
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
      const item = this.toTorrentListItem(raw);
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

    let savePath: string | null = null;
    let contentPath: string | null = null;

    for (const raw of torrentInfoList) {
      if (typeof raw !== 'object' || raw === null) {
        continue;
      }
      const rawObj = raw as Record<string, unknown>;
      savePath =
        typeof rawObj['save_path'] === 'string'
          ? rawObj['save_path'].trim() || null
          : null;
      contentPath =
        typeof rawObj['content_path'] === 'string'
          ? rawObj['content_path'].trim() || null
          : null;
      break;
    }

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
      savePath: this.applyPathMappings(resolvedSavePath, mappings),
      contentPath: this.applyPathMappings(resolvedContentPath, mappings),
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
    return this.applyPathMappings(input, mappings);
  }

  private async loadPathMappings(): Promise<
    Array<{ from: string; to: string; fromNormalized: string }>
  > {
    const settings = await this.systemSettingsService.getSettings();
    const raw = settings.qbittorrentPathMappings ?? [];
    return raw
      .map((entry) => ({
        from: entry.from,
        to: entry.to,
        fromNormalized: this.normalizeForCompare(entry.from),
      }))
      .filter((entry) => entry.fromNormalized.length > 0 && entry.to.length > 0)
      .sort((a, b) => b.fromNormalized.length - a.fromNormalized.length);
  }

  private applyPathMappings(
    input: string | null,
    mappings: Array<{ from: string; to: string; fromNormalized: string }>,
  ): string | null {
    if (!input || mappings.length === 0) return input;
    const candidate = this.normalizeForCompare(input);
    for (const mapping of mappings) {
      const prefix = mapping.fromNormalized;
      const matches =
        candidate === prefix ||
        candidate.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
      if (!matches) continue;

      const remainder = candidate.slice(prefix.length).replace(/^\/+/, '');
      const targetUsesBackslash =
        /[\\]/.test(mapping.to) || /^[A-Za-z]:[\\/]/.test(mapping.to);
      const trimmedTo = mapping.to.replace(/[\\/]+$/, '');
      if (!remainder) {
        return trimmedTo;
      }
      const remainderNative = targetUsesBackslash
        ? remainder.replace(/\//g, '\\')
        : remainder;
      const separator = targetUsesBackslash ? '\\' : '/';
      return `${trimmedTo}${separator}${remainderNative}`;
    }
    return input;
  }

  private normalizeForCompare(value: string): string {
    return value.replace(/\\+/g, '/').replace(/\/+$/, '').toLowerCase();
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
    const normalizedHint = this.normalizeTorrentMediaHint(hint);

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
    const deadline = Date.now() + TorrentService.HASH_DISCOVERY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const torrents = await this.qbittorrentApiClient.listTorrents({ tag });
        for (const raw of torrents) {
          const item = this.toTorrentListItem(raw);
          if (item?.hash) {
            return item.hash;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to discover qBittorrent hash for tag ${tag}: ${message}`,
        );
      }

      await this.delay(TorrentService.HASH_DISCOVERY_POLL_MS);
    }

    this.logger.warn(
      `Timed out discovering qBittorrent hash for tag ${tag} after ${TorrentService.HASH_DISCOVERY_TIMEOUT_MS}ms.`,
    );
    return null;
  }

  private delay(durationMs: number): Promise<void> {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));
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

  async setTorrentOrderMode(hash: string, orderMode: 'sequential' | 'random') {
    const normalizedHash = this.normalizeHash(hash);
    // The /torrents/properties endpoint does not include seq_dl /
    // f_l_piece_prio in all qBittorrent versions; the /torrents/info list
    // endpoint reliably does. Fetch the single-torrent entry from there.
    const torrent = await this.getTorrentByHash(normalizedHash);

    if (
      !torrent ||
      typeof torrent.sequentialDownload !== 'boolean' ||
      typeof torrent.firstLastPiecePriority !== 'boolean'
    ) {
      throw new BadGatewayException(
        'qBittorrent did not return sequential download flags for this torrent.',
      );
    }

    const desiredSequential = orderMode === 'sequential';
    const desiredFirstLastPiecePriority = desiredSequential;

    let sequentialChanged = false;
    let firstLastPiecePriorityChanged = false;

    if (torrent.sequentialDownload !== desiredSequential) {
      await this.qbittorrentApiClient.toggleSequentialDownload(normalizedHash);
      sequentialChanged = true;
    }

    if (torrent.firstLastPiecePriority !== desiredFirstLastPiecePriority) {
      await this.qbittorrentApiClient.toggleFirstLastPiecePriority(
        normalizedHash,
      );
      firstLastPiecePriorityChanged = true;
    }

    if (sequentialChanged || firstLastPiecePriorityChanged) {
      this.logger.log(
        `Enforced ${orderMode} order on ${normalizedHash} ` +
          `(seq toggled=${sequentialChanged}, first/last toggled=${firstLastPiecePriorityChanged}; ` +
          `was seq=${torrent.sequentialDownload} firstLast=${torrent.firstLastPiecePriority})`,
      );
    }

    return {
      hash: normalizedHash,
      orderMode,
      sequentialChanged,
      firstLastPiecePriorityChanged,
      message:
        orderMode === 'sequential'
          ? 'Torrent switched to sequential piece order.'
          : 'Torrent switched to random piece order.',
    };
  }

  private async resolveOrderMode(
    dto: AddTorrentDto,
  ): Promise<'sequential' | 'random'> {
    if (dto.orderMode) {
      return dto.orderMode;
    }

    if (dto.intent === 'stream') {
      return 'sequential';
    }

    if (dto.intent === 'background') {
      return 'random';
    }

    const settings = await this.systemSettingsService.getSettings();
    return settings.qbittorrentDefaultOrderMode;
  }

  private normalizeHash(hash: string): string {
    const normalized = hash.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Torrent hash is required.');
    }

    return normalized;
  }

  private normalizeOptionalHash(
    hash: string | null | undefined,
  ): string | null {
    if (typeof hash !== 'string') {
      return null;
    }

    const normalized = hash.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return /^[a-f0-9]{40}$/.test(normalized) ? normalized : null;
  }

  private async getKnownTorrentMetadata(
    hash: string,
  ): Promise<KnownTorrentMetadata | null> {
    const persisted = await this.knownTorrentMetadataStore.get(hash);
    if (!persisted) {
      return null;
    }
    return {
      hash: persisted.hash,
      titleHint: persisted.titleHint,
      mediaHint: persisted.mediaHint
        ? {
            ...persisted.mediaHint,
            tags: [...persisted.mediaHint.tags],
          }
        : null,
      savePath: persisted.savePath,
      contentPath: persisted.contentPath,
      files: persisted.files.map((file) => ({ ...file })),
      updatedAtMs: persisted.updatedAtMs,
    };
  }

  private async rememberKnownTorrentMetadata(input: {
    hash: string;
    titleHint: string | null;
    mediaHint?: Partial<TorrentMediaHint> | TorrentMediaHint | null;
    savePath: string | null;
    contentPath: string | null;
    files: TorrentMetadataFileHint[];
  }): Promise<void> {
    const normalizedHash = this.normalizeHash(input.hash);
    const existing = await this.knownTorrentMetadataStore.get(normalizedHash);

    const mergedFiles = this.mergeKnownTorrentFiles(
      existing?.files ?? [],
      input.files,
    );
    const nextSavePath = input.savePath?.trim() || existing?.savePath || null;
    const nextContentPath =
      input.contentPath?.trim() || existing?.contentPath || null;
    const nextTitleHint =
      input.titleHint?.trim() || existing?.titleHint || null;
    const incomingMediaHint = this.normalizeTorrentMediaHint(input.mediaHint);
    const nextMediaHint = incomingMediaHint ?? existing?.mediaHint ?? null;

    await this.knownTorrentMetadataStore.upsert({
      hash: normalizedHash,
      titleHint: nextTitleHint,
      mediaHint: nextMediaHint,
      savePath: nextSavePath,
      contentPath: nextContentPath,
      files: mergedFiles,
      updatedAtMs: Date.now(),
    });
  }

  private normalizeTorrentMediaHint(
    hint: Partial<TorrentMediaHint> | TorrentMediaHint | null | undefined,
  ): TorrentMediaHint | null {
    if (!hint || typeof hint !== 'object' || Array.isArray(hint)) {
      return null;
    }

    const title = typeof hint.title === 'string' ? hint.title.trim() : '';
    if (!title) {
      return null;
    }

    const normalizedTitle =
      typeof hint.normalizedTitle === 'string'
        ? hint.normalizedTitle.trim() || title
        : title;
    const releaseYear =
      typeof hint.releaseYear === 'number' && Number.isFinite(hint.releaseYear)
        ? Math.floor(hint.releaseYear)
        : null;
    const mediaType =
      hint.mediaType === 'movie' ||
      hint.mediaType === 'show' ||
      hint.mediaType === 'other'
        ? hint.mediaType
        : null;
    const description =
      typeof hint.description === 'string'
        ? hint.description.trim() || null
        : null;
    const tags = Array.isArray(hint.tags)
      ? hint.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
    const posterUrl =
      typeof hint.posterUrl === 'string' ? hint.posterUrl.trim() || null : null;
    const backdropUrl =
      typeof hint.backdropUrl === 'string'
        ? hint.backdropUrl.trim() || null
        : null;
    const remoteSource =
      hint.remoteSource === 'tmdb' || hint.remoteSource === 'jikan'
        ? hint.remoteSource
        : null;
    const remoteSourceId =
      typeof hint.remoteSourceId === 'string'
        ? hint.remoteSourceId.trim() || null
        : null;

    return {
      title,
      normalizedTitle,
      releaseYear,
      mediaType,
      description,
      tags,
      posterUrl,
      backdropUrl,
      remoteSource,
      remoteSourceId,
    };
  }

  private mergeKnownTorrentFiles(
    existingFiles: TorrentFileHint[],
    incomingFiles: TorrentMetadataFileHint[],
  ): TorrentFileHint[] {
    const merged = new Map<string, TorrentFileHint>();

    const insert = (name: string, size: number) => {
      const normalizedName = this.normalizeTorrentRelativePath(name);
      if (!normalizedName) {
        return;
      }

      const key = normalizedName.toLowerCase();
      const safeSize = Number.isFinite(size)
        ? Math.max(0, Math.floor(size))
        : 0;
      const previous = merged.get(key);
      if (!previous || safeSize > previous.size) {
        merged.set(key, { name: normalizedName, size: safeSize });
      }
    };

    for (const file of existingFiles) {
      insert(file.name, file.size);
    }

    for (const file of incomingFiles) {
      insert(file.name, file.size);
    }

    return [...merged.values()];
  }

  private normalizeTorrentRelativePath(value: string): string | null {
    const normalized = value.trim().replace(/\\/g, '/');
    if (!normalized) {
      return null;
    }

    const segments = normalized
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => segment !== '.');

    if (segments.length === 0 || segments.some((segment) => segment === '..')) {
      return null;
    }

    return segments.join('/');
  }

  private toTorrentListItem(value: unknown): TorrentListItem | null {
    if (!this.isObject(value)) {
      return null;
    }

    const hash = this.toStringOrEmpty(value.hash).trim();
    if (!hash) {
      return null;
    }

    return {
      hash,
      name: this.toStringOrEmpty(value.name) || hash,
      state: this.toStringOrEmpty(value.state) || 'unknown',
      progress: this.clampFraction(this.toNumber(value.progress, 0)),
      etaSeconds: this.toInteger(value.eta, 0),
      downloadRate: this.toInteger(value.dlspeed, 0),
      uploadRate: this.toInteger(value.upspeed, 0),
      sizeBytes: this.toInteger(value.size, 0),
      completedBytes: this.toInteger(value.completed, 0),
      savePath: this.toNullableString(value.save_path),
      sequentialDownload: this.toOptionalBoolean(value.seq_dl),
      firstLastPiecePriority: this.toOptionalBoolean(value.f_l_piece_prio),
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toStringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private toInteger(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }

    return fallback;
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private clampFraction(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private toOptionalBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (value === 0) {
        return false;
      }

      if (value === 1) {
        return true;
      }
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return null;
  }
}
