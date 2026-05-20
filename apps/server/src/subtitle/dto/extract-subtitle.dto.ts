import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ExtractSubtitleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  streamIndex!: number;
}
