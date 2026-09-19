import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreamModule } from '../stream/stream.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { BroadcastController } from './presentation/controllers/broadcast.controller';
import { BroadcastService } from './application/services/broadcast.service';
import { BroadcastSessionStore } from './infrastructure/stores/broadcast-session.store';
import { BroadcastDirectStreamTimeline } from './application/services/broadcast-direct-stream-timeline.service';
import { BroadcastIpLocationService } from './application/services/broadcast-ip-location.service';

@Module({
  imports: [AuthModule, StreamModule, SubtitleModule],
  controllers: [BroadcastController],
  providers: [
    BroadcastSessionStore,
    BroadcastService,
    BroadcastDirectStreamTimeline,
    BroadcastIpLocationService,
  ],
  exports: [BroadcastService],
})
export class BroadcastModule {}
