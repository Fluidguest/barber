import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** GET /dashboard/today?date=YYYY-MM-DD (date opcional). */
  @Get('today')
  today(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.dashboard.today(u.tenantId, date);
  }
}
