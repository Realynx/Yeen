import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SystemSettingsService } from './system-settings.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Put()
  updateSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.systemSettingsService.updateSettings(dto);
  }
}
