import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { UpdateSystemSettingsDto } from '../../application/dto/update-system-settings.dto';
import { SystemSettingsService } from '../../application/services/system-settings.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  getSettings() {
    return this.systemSettingsService.getPublicSettings();
  }

  @Put()
  async updateSettings(@Body() dto: UpdateSystemSettingsDto) {
    await this.systemSettingsService.updateSettings(dto);
    return this.systemSettingsService.getPublicSettings();
  }
}
