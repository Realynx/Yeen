import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PurgeRecycleDeletionsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  operationPaths?: string[];

  @IsOptional()
  @IsBoolean()
  purgeAll?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  olderThanDays?: number;
}
