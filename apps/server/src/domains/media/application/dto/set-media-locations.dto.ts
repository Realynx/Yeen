import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MediaLibraryLocationDto {
  @IsString()
  path!: string;

  @IsIn(['video', 'music'])
  type!: 'video' | 'music';
}

export class SetMediaLocationsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaLibraryLocationDto)
  libraryLocations?: MediaLibraryLocationDto[];
}
