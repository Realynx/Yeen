import { IsBoolean } from 'class-validator';

export class UpdateBroadcastEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
