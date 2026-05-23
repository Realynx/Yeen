import { Module } from '@nestjs/common';
import { ProgressController } from './presentation/controllers/progress.controller';
import { ProgressService } from './application/services/progress.service';
import { ProgressStore } from './infrastructure/stores/progress.store';

@Module({
  controllers: [ProgressController],
  providers: [ProgressStore, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
