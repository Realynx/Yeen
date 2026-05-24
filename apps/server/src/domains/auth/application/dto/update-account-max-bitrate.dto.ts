import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateAccountMaxBitrateDto {
  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(50000)
  maxBitrateKbps?: number | null;
}
