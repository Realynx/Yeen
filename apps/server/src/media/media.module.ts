import { Module } from '@nestjs/common';
import { MetadataApiCacheStore } from './metadata-api-cache.store';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { MediaAiMetadataService } from './media-ai-metadata.service';
import { MediaController } from './media.controller';
import { MediaImagesController } from './media-images.controller';
import { MediaLocationsStore } from './media-locations.store';
import { MediaNfoReader } from './media-nfo.reader';
import { MediaPreviewResolver } from './media-preview.resolver';
import { MediaProbeAdapter } from './media-probe.adapter';
import { MediaScannerService } from './media-scanner.service';
import { MediaScanStore } from './media-scan.store';
import { MediaService } from './media.service';
import { MediaStore } from './media.store';
import { MediaSubtitleResolver } from './media-subtitle.resolver';
import { JikanMetadataService } from './jikan-metadata.service';
import { TmdbMetadataService } from './tmdb-metadata.service';
import { MediaCommitStore } from './media-commit.store';
import { MediaFsCommitService } from './media-fs-commit.service';

@Module({
  imports: [SystemSettingsModule],
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
    MediaFsCommitService,
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
