import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { KnownTorrentMetadataStore } from './known-torrent-metadata.store';
import { QbittorrentApiClient } from './qbittorrent-api.client';
import { TorrentController } from './torrent.controller';
import { TorrentMediaIndexStore } from './torrent-media-index.store';
import { TorrentService } from './torrent.service';

@Module({
  imports: [SystemSettingsModule],
  controllers: [TorrentController],
  providers: [
    QbittorrentApiClient,
    TorrentService,
    KnownTorrentMetadataStore,
    TorrentMediaIndexStore,
  ],
  exports: [TorrentService, TorrentMediaIndexStore],
})
export class TorrentModule {}
