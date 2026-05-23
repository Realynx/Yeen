import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/presentation/guards/admin.guard';
import { SystemSettingsController } from './presentation/controllers/system-settings.controller';
import { SystemSettingsService } from './application/services/system-settings.service';
import { SystemSettingsStore } from './infrastructure/stores/system-settings.store';

@Module({
  controllers: [SystemSettingsController],
  providers: [SystemSettingsStore, SystemSettingsService, AdminGuard],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
