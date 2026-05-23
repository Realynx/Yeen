import { IsArray, IsOptional, IsString } from 'class-validator';

export class ScanMediaDto {
  @IsOptional()
  @IsString()
  libraryPath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  libraryPaths?: string[];
}
