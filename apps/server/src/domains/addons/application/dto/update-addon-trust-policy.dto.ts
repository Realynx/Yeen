import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAddonTrustPolicyDto {
  @IsBoolean()
  allowUnsigned!: boolean;

  @IsBoolean()
  @IsOptional()
  acknowledgeRisk?: boolean;
}
