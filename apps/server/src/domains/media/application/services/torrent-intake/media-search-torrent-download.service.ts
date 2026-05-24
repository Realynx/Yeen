import { Injectable } from '@nestjs/common';
import { DownloadIptorrentDto } from '../../dto/download-iptorrent.dto';
import { IptorrentsSearchService } from '../torrent-search/iptorrents-search.service';
import { NyaaSearchService } from '../torrent-search/nyaa-search.service';
import { MediaService } from '../media.service';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import { TorrentService } from '../../../../torrent/application/services/torrent.service';

export type TorrentSearchSource = 'iptorrents' | 'nyaa';

@Injectable()
export class MediaSearchTorrentDownloadService {
  constructor(
    private readonly iptorrentsSearchService: IptorrentsSearchService,
    private readonly nyaaSearchService: NyaaSearchService,
    private readonly torrentService: TorrentService,
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async startDownload(source: TorrentSearchSource, dto: DownloadIptorrentDto) {
    const intent: 'background' | 'stream' =
      dto.intent === 'background' ? 'background' : 'stream';
    const systemSettings = await this.systemSettingsService.getSettings();
    const torrentFile =
      source === 'iptorrents'
        ? await this.iptorrentsSearchService.downloadTorrentFile({
            downloadUrl: dto.downloadUrl,
            fallbackFileName: dto.title,
          })
        : await this.nyaaSearchService.downloadTorrentFile({
            downloadUrl: dto.downloadUrl,
            fallbackFileName: dto.title,
          });

    const seedAfterDownload =
      source === 'iptorrents'
        ? systemSettings.iptorrentsSeedingEnabled
        : systemSettings.nyaaSeedingEnabled;

    const result = await this.torrentService.addTorrent(
      {
        savePath: dto.savePath?.trim() || undefined,
        paused: false,
        seedAfterDownload,
        intent,
        orderMode: intent === 'stream' ? 'sequential' : undefined,
      },
      torrentFile,
    );

    if (result.hash && dto.metadataHint) {
      await this.torrentService.setKnownTorrentMediaHint(
        result.hash,
        dto.metadataHint,
      );
    }

    // Both stream and background downloads should be indexed once enough of the
    // file is on disk so the new media shows up in the library.
    const indexResult = result.hash
      ? await this.mediaService.indexTorrentFile(result.hash).catch(() => null)
      : null;

    return {
      ...result,
      message: this.buildStartMessage(source, intent),
      indexResult,
    };
  }

  private buildStartMessage(
    source: TorrentSearchSource,
    intent: 'background' | 'stream',
  ): string {
    if (source === 'iptorrents') {
      return intent === 'stream'
        ? 'Stream torrent started in qBittorrent (sequential order).'
        : 'Torrent download started in qBittorrent.';
    }

    return intent === 'stream'
      ? 'Nyaa stream torrent started in qBittorrent (sequential order).'
      : 'Nyaa torrent download started in qBittorrent.';
  }
}
