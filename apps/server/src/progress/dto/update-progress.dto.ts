import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsString()
  @MaxLength(256)
  seriesPreferenceKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredAudioLanguage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredSubtitleLanguage?: string | null;

  @IsOptional()
  @IsBoolean()
  subtitlePreferenceEnabled?: boolean | null;
}
