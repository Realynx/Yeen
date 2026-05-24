import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetAccountPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
