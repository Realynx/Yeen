import { IsIn } from 'class-validator';
import type { RestartMode } from '../services/restart-coordinator.service';

export class RequestRuntimeRestartDto {
  @IsIn(['graceful', 'instant'])
  mode!: RestartMode;
}
