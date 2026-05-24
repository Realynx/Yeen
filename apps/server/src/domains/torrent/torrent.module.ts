import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { KnownTorrentMetadataStore } from './infrastructure/stores/known-torrent-metadata.store';
import { QbittorrentApiClient } from './infrastructure/clients/qbittorrent-api.client';
import { QbittorrentHttpClient } from './infrastructure/clients/qbittorrent-http.client';
import { TorrentController } from './presentation/controllers/torrent.controller';
import { TorrentMediaIndexStore } from './infrastructure/stores/torrent-media-index.store';
import { TorrentService } from './application/services/torrent.service';
import { TorrentPathResolutionService } from './application/services/torrent-path-resolution.service';
import { TorrentKnownMetadataService } from './application/services/torrent-known-metadata.service';
import { TorrentRuntimeControlService } from './application/services/torrent-runtime-control.service';

@Module({
  imports: [SystemSettingsModule],
  controllers: [TorrentController],
  providers: [
    QbittorrentHttpClient,
    QbittorrentApiClient,
    TorrentService,
    TorrentPathResolutionService,
    TorrentKnownMetadataService,
    TorrentRuntimeControlService,
    KnownTorrentMetadataStore,
    TorrentMediaIndexStore,
  ],
  exports: [TorrentService, TorrentMediaIndexStore],
})
export class TorrentModule {}
