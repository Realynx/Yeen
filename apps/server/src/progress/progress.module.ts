import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ProgressStore } from './progress.store';

@Module({
  controllers: [ProgressController],
  providers: [ProgressStore, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
