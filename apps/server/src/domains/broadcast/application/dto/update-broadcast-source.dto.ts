import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBroadcastSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mediaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  hlsSessionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  subtitleFileName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  selectedAudioStreamIndex?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(250)
  @Max(50000)
  maxVideoBitrateKbps?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(48)
  @Max(384)
  audioBitrateKbps?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(240)
  @Max(2160)
  maxOutputHeight?: number | null;
}
