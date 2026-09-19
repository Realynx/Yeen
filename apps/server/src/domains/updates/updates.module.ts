import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/presentation/guards/admin.guard';
import { CoreUpdateService } from './application/services/core-update.service';
import { UpdateHandoffService } from './application/services/update-handoff.service';
import { AdminCoreUpdatesController } from './presentation/controllers/admin-core-updates.controller';

@Module({
  controllers: [AdminCoreUpdatesController],
  providers: [AdminGuard, CoreUpdateService, UpdateHandoffService],
})
export class UpdatesModule {}
