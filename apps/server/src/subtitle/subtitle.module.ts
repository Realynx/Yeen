import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleController } from './subtitle.controller';
import { SubtitleExtractionService } from './subtitle-extraction.service';
import { SubtitleFileStreamService } from './subtitle-file-stream.service';
import { SubtitleListingService } from './subtitle-listing.service';
import { SubtitleLookupService } from './subtitle-lookup.service';
import { SubtitleOnlineLookupService } from './subtitle-online-lookup.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { SubtitleTracksService } from './subtitle-tracks.service';

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
})
export class SubtitleModule {}
