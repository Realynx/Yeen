import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestTvPairingDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  devicePlatform?: string;
}
