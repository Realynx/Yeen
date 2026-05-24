import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class QbittorrentPathMappingDto {
  @IsString()
  @MaxLength(512)
  from!: string;

  @IsString()
  @MaxLength(512)
  to!: string;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  ffmpegPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  ffprobePath?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  thumbnailCaptureCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  mediaMetadataSqlitePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  qbittorrentBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  qbittorrentUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  qbittorrentPassword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  qbittorrentRequestTimeoutMs?: number;

  @IsOptional()
  @IsString()
  @IsIn(['sequential', 'random'])
  qbittorrentDefaultOrderMode?: 'sequential' | 'random';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => QbittorrentPathMappingDto)
  qbittorrentPathMappings?: QbittorrentPathMappingDto[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  iptorrentsUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  iptorrentsPassword?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  iptorrentsSeedingEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nyaaSeedingEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  aiMetadataEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ollama', 'openai'])
  aiProvider?: 'ollama' | 'openai';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  aiModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  aiOllamaBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  aiOpenAiApiKey?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  aiDeduplicationEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  aiRequestTimeoutMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  tmdbApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  openSubtitlesApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  transcodePreset?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(40)
  transcodeCrf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(50000)
  transcodeDefaultMaxBitrateKbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(48)
  @Max(384)
  transcodeAudioBitrateKbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(240)
  @Max(2160)
  transcodeMaxOutputHeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  transcodeRateControlBufferSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  hlsSegmentSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  subtitleDefaultLanguage?: string;
}
