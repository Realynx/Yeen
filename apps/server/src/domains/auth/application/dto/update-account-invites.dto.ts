import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateAccountInvitesDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  invitesRemaining!: number;
}
