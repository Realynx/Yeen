import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { ApplyCoreUpdateDto } from '../../application/dto/apply-core-update.dto';
import { CoreUpdateService } from '../../application/services/core-update.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/core-updates')
export class AdminCoreUpdatesController {
  constructor(private readonly updates: CoreUpdateService) {}

  @Get('status')
  getStatus() {
    return this.updates.getStatus();
  }

  @Post('check')
  check() {
    return this.updates.check();
  }

  @Post('apply')
  @HttpCode(202)
  apply(@Body() dto: ApplyCoreUpdateDto) {
    return this.updates.apply(dto.mode);
  }
}
