import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import type { BroadcastPlaybackUpdate } from '@yeen/shared-contracts';

export class UpdateBroadcastPlaybackDto implements BroadcastPlaybackUpdate {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  positionSeconds!: number;

  @IsBoolean()
  playbackIsPlaying!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  syncTimestampMs?: number;

  @IsOptional()
  @IsBoolean()
  activePlayer?: boolean;
}
