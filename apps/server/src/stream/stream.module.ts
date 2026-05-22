import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { TorrentModule } from '../torrent/torrent.module';
import { HlsSessionStore } from './hls-session.store';
import { RangeStreamService } from './range-stream.service';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { HlsManifestService } from './hls/hls-manifest.service';
import { HlsSegmentTranscoder } from './hls/hls-segment-transcoder.service';
import { TorrentDataAvailabilityService } from './hls/torrent-data-availability.service';

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
})
export class StreamModule {}
