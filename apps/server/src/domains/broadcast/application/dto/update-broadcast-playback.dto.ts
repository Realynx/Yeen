import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateBroadcastPlaybackDto {
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
