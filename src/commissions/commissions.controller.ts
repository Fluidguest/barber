import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { ListCommissionsDto } from './dto/list-commissions.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListCommissionsDto) {
    return this.commissions.list(u.tenantId, q);
  }

  @Get('summary')
  summary(@CurrentUser() u: AuthUser, @Query('periodRef') periodRef: string) {
    return this.commissions.summary(u.tenantId, periodRef);
  }

  @Post('close')
  close(@CurrentUser() u: AuthUser, @Body() dto: ClosePeriodDto) {
    return this.commissions.closePeriod(u.tenantId, dto);
  }
}
