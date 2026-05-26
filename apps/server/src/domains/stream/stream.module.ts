import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { TorrentModule } from '../torrent/torrent.module';
import { HlsSessionStore } from './infrastructure/stores/hls-session.store';
import { RangeStreamService } from './application/services/range-stream.service';
import { StreamController } from './presentation/controllers/stream.controller';
import { StreamService } from './application/services/stream.service';
import { HlsManifestService } from './application/services/hls/hls-manifest.service';
import { HlsSessionCleanupService } from './application/services/hls/hls-session-cleanup.service';
import { HlsSegmentTranscoder } from './application/services/hls/hls-segment-transcoder.service';
import { TorrentDataAvailabilityService } from './application/services/hls/torrent-data-availability.service';

@Module({
  imports: [AuthModule, MediaModule, SystemSettingsModule, TorrentModule],
  controllers: [StreamController],
  providers: [
    HlsSessionStore,
    RangeStreamService,
    HlsManifestService,
    HlsSessionCleanupService,
    HlsSegmentTranscoder,
    TorrentDataAvailabilityService,
    StreamService,
  ],
  exports: [StreamService],
})
export class StreamModule {}
