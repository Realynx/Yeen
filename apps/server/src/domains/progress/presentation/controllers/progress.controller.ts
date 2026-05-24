import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../auth/presentation/decorators/current-user.decorator';
import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { UpdateProgressDto } from '../../application/dto/update-progress.dto';
import { ProgressService } from '../../application/services/progress.service';

@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.progressService.list(user);
  }

  @Get(':mediaId')
  get(@CurrentUser() user: AuthUser, @Param('mediaId') mediaId: string) {
    return this.progressService.get(user, mediaId);
  }

  @Put(':mediaId')
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.upsert(user, mediaId, dto);
  }
}
