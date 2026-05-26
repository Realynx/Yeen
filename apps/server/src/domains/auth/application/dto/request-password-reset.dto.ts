import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
