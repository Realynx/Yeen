import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ProgressModule } from '../progress/progress.module';
import { DashboardService } from './application/services/dashboard.service';
import { DashboardController } from './presentation/controllers/dashboard.controller';

@Module({
  imports: [MediaModule, ProgressModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
