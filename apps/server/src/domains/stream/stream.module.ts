import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { TorrentModule } from '../torrent/torrent.module';
import { HlsSessionStore } from './infrastructure/stores/hls-session.store';
import { RangeStreamService } from './application/services/range-stream.service';
import { StreamController } from './presentation/controllers/stream.controller';
import { StreamService } from './application/services/stream.service';
import { HlsManifestService } from './application/services/hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './application/services/hls/hls-segment-transcoder.service';
import { TorrentDataAvailabilityService } from './application/services/hls/torrent-data-availability.service';

@Module({
  imports: [MediaModule, SystemSettingsModule, TorrentModule],
  controllers: [StreamController],
  providers: [
    HlsSessionStore,
    RangeStreamService,
    HlsManifestService,
    HlsSegmentTranscoder,
    TorrentDataAvailabilityService,
    StreamService,
  ],
  exports: [StreamService],
})
export class StreamModule {}
