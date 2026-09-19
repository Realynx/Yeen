import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { AddonRuntimeService } from '../../application/services/addon-runtime.service';

@UseGuards(JwtAuthGuard)
@Controller('addons/runtime')
export class AddonRuntimeController {
  constructor(private readonly runtime: AddonRuntimeService) {}

  @Get()
  getManifest() {
    return this.runtime.getWebManifest();
  }

  @Get(':id/:digest/assets/{*assetPath}')
  streamAsset(
    @Param('id') id: string,
    @Param('digest') digest: string,
    @Param('assetPath') assetPath: string | string[],
    @Res() response: Response,
  ) {
    return this.runtime.streamWebAsset({
      id,
      digest,
      assetPath: Array.isArray(assetPath) ? assetPath.join('/') : assetPath,
      response,
    });
  }
}
