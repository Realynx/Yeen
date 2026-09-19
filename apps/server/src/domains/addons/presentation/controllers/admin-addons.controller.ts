import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { UpdateAddonTrustPolicyDto } from '../../application/dto/update-addon-trust-policy.dto';
import { AddonsService } from '../../application/services/addons.service';

const MAX_ADDON_ARCHIVE_BYTES = 256 * 1024 * 1024;

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('addons')
export class AdminAddonsController {
  constructor(private readonly addons: AddonsService) {}

  @Get()
  list() {
    return this.addons.list();
  }

  @Get('trust-policy')
  getTrustPolicy() {
    return this.addons.getTrustPolicy();
  }

  @Put('trust-policy')
  updateTrustPolicy(@Body() dto: UpdateAddonTrustPolicyDto) {
    return this.addons.updateTrustPolicy(dto);
  }

  @Post('packages')
  @UseInterceptors(
    FileInterceptor('package', {
      limits: { fileSize: MAX_ADDON_ARCHIVE_BYTES, files: 1, fields: 0 },
    }),
  )
  installPackage(@UploadedFile() uploadedFile?: unknown) {
    return this.addons.install(normalizeUpload(uploadedFile));
  }

  @Post(':id/enable')
  enable(@Param('id') id: string) {
    return this.addons.enable(id);
  }

  @Post(':id/disable')
  disable(@Param('id') id: string) {
    return this.addons.disable(id);
  }
}

function normalizeUpload(
  value: unknown,
): { buffer: Buffer; originalname: string } | undefined {
  if (!isObject(value) || !Buffer.isBuffer(value.buffer)) return undefined;
  const originalname =
    typeof value.originalname === 'string' ? value.originalname.trim() : '';
  return {
    buffer: value.buffer,
    originalname: originalname || 'addon.zip',
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
