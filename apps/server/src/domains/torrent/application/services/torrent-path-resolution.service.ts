import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { QbittorrentApiClient } from '../../infrastructure/clients/qbittorrent-api.client';
import {
  applyTorrentPathMappings,
  buildTorrentPathMappings,
  type TorrentPathMapping,
} from '../helpers/torrent-path-and-file-helpers';
import { extractTorrentPathsFromInfoList } from '../helpers/torrent-qbittorrent-mappers';
import { normalizeTorrentHashInput } from '../helpers/torrent-value-normalizers';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import type { TorrentPaths } from '../types/torrent.service.types';
import { TorrentKnownMetadataService } from './torrent-known-metadata.service';

@Injectable()
export class TorrentPathResolutionService {
  private readonly logger = new Logger(TorrentPathResolutionService.name);

  constructor(
    private readonly qbittorrentApiClient: QbittorrentApiClient,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly torrentKnownMetadataService: TorrentKnownMetadataService,
  ) {}

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
      await this.torrentKnownMetadataService.rememberMetadata({
        hash: normalizedHash,
        titleHint: null,
        mediaHint: null,
        savePath,
        contentPath,
        files: [],
      });
    }

    const resolvedSavePath =
      savePath ??
      (await this.torrentKnownMetadataService.getSavePath(normalizedHash));
    const resolvedContentPath =
      contentPath ??
      (await this.torrentKnownMetadataService.getContentPath(normalizedHash));

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
    if (!input) {
      return input;
    }

    const mappings = await this.loadPathMappings();
    return applyTorrentPathMappings(input, mappings);
  }

  async getTorrentSavePath(hash: string): Promise<string | null> {
    const paths = await this.getTorrentPaths(hash);
    return paths.savePath;
  }

  async getTorrentContentPath(hash: string): Promise<string | null> {
    const paths = await this.getTorrentPaths(hash);
    return paths.contentPath;
  }

  private async loadPathMappings(): Promise<TorrentPathMapping[]> {
    const settings = await this.systemSettingsService.getSettings();
    return buildTorrentPathMappings(settings.qbittorrentPathMappings ?? []);
  }

  private normalizeHash(hash: string): string {
    const normalized = normalizeTorrentHashInput(hash);
    if (!normalized) {
      throw new BadRequestException('Torrent hash is required.');
    }

    return normalized;
  }
}
