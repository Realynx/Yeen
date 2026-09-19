import { IsIn } from 'class-validator';
import type { RestartMode } from '../../../lifecycle/application/services/restart-coordinator.service';

export class ApplyCoreUpdateDto {
  @IsIn(['graceful', 'instant'])
  mode!: RestartMode;
}
