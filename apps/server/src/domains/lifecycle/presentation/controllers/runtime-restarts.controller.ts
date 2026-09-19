import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RequestRuntimeRestartDto } from '../../application/dto/request-runtime-restart.dto';
import { RestartCoordinatorService } from '../../application/services/restart-coordinator.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('runtime/restarts')
export class RuntimeRestartsController {
  constructor(private readonly restartCoordinator: RestartCoordinatorService) {}

  @Post()
  @HttpCode(202)
  request(@Body() dto: RequestRuntimeRestartDto) {
    return this.restartCoordinator.request(dto.mode);
  }

  @Get('current')
  getCurrent() {
    return this.restartCoordinator.getStatus();
  }

  @Delete('current')
  cancelCurrent() {
    return this.restartCoordinator.cancel();
  }
}
