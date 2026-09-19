import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { MediaLibraryLocationDto } from './set-media-locations.dto';

export class ScanMediaDto {
  @IsOptional()
  @IsString()
  libraryPath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  libraryPaths?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaLibraryLocationDto)
  libraryLocations?: MediaLibraryLocationDto[];
}
