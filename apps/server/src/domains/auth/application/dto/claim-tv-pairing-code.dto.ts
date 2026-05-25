import { IsString, MaxLength, MinLength } from 'class-validator';

export class ClaimTvPairingCodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  code!: string;
}
