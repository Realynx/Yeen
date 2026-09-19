import { Global, Module } from '@nestjs/common';
import { AdminGuard } from '../auth/presentation/guards/admin.guard';
import { RuntimeRestartsController } from './presentation/controllers/runtime-restarts.controller';
import { PlaybackActivityService } from './application/services/playback-activity.service';
import { ProcessRestartSignalService } from './application/services/process-restart-signal.service';
import { RestartCoordinatorService } from './application/services/restart-coordinator.service';

@Global()
@Module({
  controllers: [RuntimeRestartsController],
  providers: [
    AdminGuard,
    PlaybackActivityService,
    ProcessRestartSignalService,
    RestartCoordinatorService,
  ],
  exports: [PlaybackActivityService, RestartCoordinatorService],
})
export class LifecycleModule {}
