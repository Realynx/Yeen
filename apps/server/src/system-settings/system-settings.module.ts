import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsStore } from './system-settings.store';

@Module({
  controllers: [SystemSettingsController],
  providers: [SystemSettingsStore, SystemSettingsService, AdminGuard],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
