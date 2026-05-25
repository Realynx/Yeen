import { IsString, MaxLength, MinLength } from 'class-validator';

export class PollTvPairingDto {
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  pollToken!: string;
}
