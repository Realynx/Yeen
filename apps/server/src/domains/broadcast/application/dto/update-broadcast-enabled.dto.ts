import { IsBoolean } from 'class-validator';
import type { BroadcastEnabledUpdate } from '@yeen/shared-contracts';

export class UpdateBroadcastEnabledDto implements BroadcastEnabledUpdate {
  @IsBoolean()
  enabled!: boolean;
}
