import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { BroadcastViewerHeartbeatUpdate } from '@yeen/shared-contracts';

export class UpdatePublicViewerHeartbeatDto implements BroadcastViewerHeartbeatUpdate {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  viewerId?: string;
}
