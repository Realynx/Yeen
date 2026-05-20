import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class CommitMetadataDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsBoolean()
  writeNfo?: boolean;
}

export class PlanCommitMetadataDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  mediaIds?: string[];
}
