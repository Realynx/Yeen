import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/entities/auth-user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ProgressService } from './progress.service';

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
