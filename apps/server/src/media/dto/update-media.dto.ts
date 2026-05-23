import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SeriesAssignmentKeywordRuleDto {
  @IsString()
  @MaxLength(120)
  keyword!: string;

  @IsOptional()
  @IsInt()
  @Min(-1)
  seasonNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  episodeNumber?: number | null;
}

class SeriesAssignmentPatternRuleDto {
  @IsString()
  @MaxLength(280)
  pattern!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  flags?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seasonGroup?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  episodeGroup?: number | null;

  @IsOptional()
  @IsInt()
  @Min(-1)
  seasonNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  episodeNumber?: number | null;
}

class SeriesAssignmentRulesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => SeriesAssignmentKeywordRuleDto)
  keywordMappings?: SeriesAssignmentKeywordRuleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => SeriesAssignmentPatternRuleDto)
  patternMappings?: SeriesAssignmentPatternRuleDto[];
}

export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  releaseYear?: number | null;

  @IsOptional()
  @IsIn(['movie', 'show', 'other'])
  type?: 'movie' | 'show' | 'other';

  @IsOptional()
  @IsInt()
  @Min(-1)
  seasonNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  episodeNumber?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  episodeTitle?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUrl({ require_tld: true, require_protocol: true })
  posterUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: true, require_protocol: true })
  backdropUrl?: string | null;

  @IsOptional()
  @IsIn(['tmdb', 'jikan'])
  remoteSource?: 'tmdb' | 'jikan' | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  remoteSourceId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesAssignmentRulesDto)
  seriesAssignmentRules?: SeriesAssignmentRulesDto | null;
}

export class BulkAssignEpisodesDto {
  @IsArray()
  @IsString({ each: true })
  mediaIds!: string[];

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsIn(['movie', 'show', 'other'])
  type?: 'movie' | 'show' | 'other';

  @IsOptional()
  @IsInt()
  @Min(-1)
  seasonNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  startEpisodeNumber?: number;

  @IsOptional()
  @IsIn(['filename-asc', 'existing-episode', 'as-provided'])
  episodeOrder?: 'filename-asc' | 'existing-episode' | 'as-provided';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  releaseYear?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesAssignmentRulesDto)
  seriesAssignmentRules?: SeriesAssignmentRulesDto | null;
}

export class BulkUpdateMediaDto {
  @IsArray()
  @IsString({ each: true })
  mediaIds!: string[];

  @ValidateNested()
  @Type(() => UpdateMediaDto)
  patch!: UpdateMediaDto;
}
