import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class DownloadIptorrentMetadataHintDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  normalizedTitle?: string;

  @IsOptional()
  @IsInt()
  @Max(3000)
  releaseYear?: number;

  @IsOptional()
  @IsString()
  @IsIn(['movie', 'show', 'other'])
  mediaType?: 'movie' | 'show' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: true })
  @MaxLength(2048)
  posterUrl?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: true })
  @MaxLength(2048)
  backdropUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['tmdb', 'jikan'])
  remoteSource?: 'tmdb' | 'jikan';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  remoteSourceId?: string;
}

export class DownloadIptorrentDto {
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: true })
  @MaxLength(2048)
  downloadUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  savePath?: string;

  @IsOptional()
  @IsString()
  @IsIn(['stream', 'background'])
  intent?: 'stream' | 'background';

  @IsOptional()
  @ValidateNested()
  @Type(() => DownloadIptorrentMetadataHintDto)
  metadataHint?: DownloadIptorrentMetadataHintDto;
}
