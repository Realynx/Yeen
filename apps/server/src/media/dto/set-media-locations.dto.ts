import { IsArray, IsString } from 'class-validator';

export class SetMediaLocationsDto {
  @IsArray()
  @IsString({ each: true })
  locations!: string[];
}
