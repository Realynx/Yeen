import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../auth/presentation/decorators/current-user.decorator';
import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { DashboardService } from '../../application/services/dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('continue-watching')
  getContinueWatching(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getContinueWatching(user);
  }

  @Get('recently-added')
  getRecentlyAdded(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getRecentlyAdded(user);
  }

  @Get('featured')
  getFeatured(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getFeatured(user);
  }

  @Get('genre-rows')
  getGenreRows(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getGenreRows(user);
  }
}
