import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePublicViewerHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  viewerId?: string;
}
