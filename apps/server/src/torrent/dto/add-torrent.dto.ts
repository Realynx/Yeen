import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export class AddTorrentDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  magnetLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  savePath?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  seedAfterDownload?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['stream', 'background'])
  intent?: 'stream' | 'background';

  @IsOptional()
  @IsString()
  @IsIn(['sequential', 'random'])
  orderMode?: 'sequential' | 'random';
}
