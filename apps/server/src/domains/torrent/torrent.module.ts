import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { KnownTorrentMetadataStore } from './infrastructure/stores/known-torrent-metadata.store';
import { QbittorrentApiClient } from './infrastructure/clients/qbittorrent-api.client';
import { TorrentController } from './presentation/controllers/torrent.controller';
import { TorrentMediaIndexStore } from './infrastructure/stores/torrent-media-index.store';
import { TorrentService } from './application/services/torrent.service';

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
