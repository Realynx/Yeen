import { Module } from '@nestjs/common';
import { MetadataApiCacheStore } from './infrastructure/stores/metadata-api-cache.store';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { MediaAiMetadataService } from './application/services/media-ai-metadata.service';
import { MediaController } from './presentation/controllers/media.controller';
import { MediaImagesController } from './presentation/controllers/media-images.controller';
import { MediaLocationsStore } from './infrastructure/stores/media-locations.store';
import { MediaNfoReader } from './infrastructure/readers/media-nfo.reader';
import { MediaPreviewResolver } from './infrastructure/resolvers/media-preview.resolver';
import { MediaProbeAdapter } from './infrastructure/adapters/media-probe.adapter';
import { MediaScannerService } from './application/services/media-scanner.service';
import { MediaScanStore } from './infrastructure/stores/media-scan.store';
import { MediaService } from './application/services/media.service';
import { MediaStore } from './infrastructure/stores/media.store';
import { MediaSubtitleResolver } from './infrastructure/resolvers/media-subtitle.resolver';
import { JikanMetadataService } from './application/services/jikan-metadata.service';
import { TmdbMetadataService } from './application/services/tmdb-metadata.service';
import { MediaCommitStore } from './infrastructure/stores/media-commit.store';
import { MediaFsCommitService } from './application/services/media-fs-commit.service';
import { MediaFsCommitPlannerService } from './application/services/media-fs-commit-planner.service';
import { MediaFsFileOpsService } from './application/services/media-fs-file-ops.service';
import { MediaFsNfoService } from './application/services/media-fs-nfo.service';
import { IptorrentsSearchService } from './application/services/iptorrents-search.service';
import { NyaaSearchService } from './application/services/nyaa-search.service';
import { MediaPathResolverService } from './application/services/media-path-resolver.service';
import { TorrentModule } from '../torrent/torrent.module';

@Module({
  imports: [SystemSettingsModule, TorrentModule],
  controllers: [MediaController, MediaImagesController],
  providers: [
    MediaStore,
    MediaLocationsStore,
    MetadataApiCacheStore,
    MediaAiMetadataService,
    TmdbMetadataService,
    JikanMetadataService,
    MediaNfoReader,
    MediaProbeAdapter,
    MediaSubtitleResolver,
    MediaPreviewResolver,
    MediaScannerService,
    MediaScanStore,
    MediaCommitStore,
    MediaFsCommitPlannerService,
    MediaFsFileOpsService,
    MediaFsNfoService,
    MediaPathResolverService,
    MediaFsCommitService,
    IptorrentsSearchService,
    NyaaSearchService,
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
