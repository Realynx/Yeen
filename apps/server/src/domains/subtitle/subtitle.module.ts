import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SubtitleCommandService } from './application/services/subtitle-command.service';
import { SubtitleController } from './presentation/controllers/subtitle.controller';
import { SubtitleExtractionService } from './application/services/subtitle-extraction.service';
import { SubtitleFileStreamService } from './application/services/subtitle-file-stream.service';
import { SubtitleListingService } from './application/services/subtitle-listing.service';
import { SubtitleLookupService } from './application/services/subtitle-lookup.service';
import { SubtitleOnlineLookupService } from './application/services/subtitle-online-lookup.service';
import { SubtitleStorageService } from './application/services/subtitle-storage.service';
import { SubtitleTracksService } from './application/services/subtitle-tracks.service';

@Module({
  imports: [MediaModule, SystemSettingsModule],
  controllers: [SubtitleController],
  providers: [
    SubtitleCommandService,
    SubtitleLookupService,
    SubtitleStorageService,
    SubtitleTracksService,
    SubtitleListingService,
    SubtitleExtractionService,
    SubtitleFileStreamService,
    SubtitleOnlineLookupService,
  ],
  exports: [SubtitleListingService, SubtitleFileStreamService],
})
export class SubtitleModule {}
