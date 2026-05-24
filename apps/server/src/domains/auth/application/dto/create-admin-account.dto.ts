import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateAdminAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @IsIn(['admin', 'sailer', 'user'])
  role?: 'admin' | 'sailer' | 'user';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  invitesRemaining?: number;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(50000)
  maxBitrateKbps?: number | null;
}
