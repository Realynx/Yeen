import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { SubtitlePreExtractionJobService } from '../../application/services/subtitle-pre-extraction-job.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/subtitles/pre-extraction')
export class AdminSubtitleMaintenanceController {
  constructor(
    private readonly preExtractionJob: SubtitlePreExtractionJobService,
  ) {}

  @Get('status')
  getStatus() {
    return this.preExtractionJob.getProgress();
  }

  @Post('start')
  @HttpCode(202)
  start() {
    return this.preExtractionJob.start();
  }
}
