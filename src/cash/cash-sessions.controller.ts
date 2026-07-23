import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CashSessionsService } from './cash-sessions.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cash: CashSessionsService) {}

  @Post('open')
  open(@CurrentUser() u: AuthUser, @Body() dto: OpenCashDto) {
    return this.cash.open(u.tenantId, u.userId, dto);
  }

  @Get('current')
  current(@CurrentUser() u: AuthUser) {
    return this.cash.current(u.tenantId);
  }

  @Get(':id')
  summary(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cash.summary(u.tenantId, id);
  }

  @Patch(':id/close')
  close(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseCashDto,
  ) {
    return this.cash.close(u.tenantId, id, dto);
  }
}
