import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateProgressDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  positionSeconds!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationSeconds!: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
