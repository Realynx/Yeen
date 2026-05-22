import { IsIn, IsOptional } from 'class-validator';

export class ImportMetadataDto {
  @IsOptional()
  @IsIn(['replace', 'upsert'])
  mode?: 'replace' | 'upsert';
}
