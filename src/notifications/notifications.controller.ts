import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.notifications.list(u.tenantId, { status, type });
  }

  /** Dispara as mensagens agendadas cujo horário já chegou. */
  @Post('dispatch')
  dispatch(@CurrentUser() u: AuthUser) {
    return this.notifications.dispatchDue(u.tenantId);
  }

  /** Envia/reenvia uma mensagem específica agora. */
  @Post(':id/send')
  send(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.notifications.sendOne(u.tenantId, id);
  }
}
