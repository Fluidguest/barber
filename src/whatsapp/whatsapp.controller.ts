import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import {
  RegisterNumberDto,
  SendMessageDto,
  SimulateInboundDto,
} from './dto/send-message.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('conversations')
  list(@CurrentUser() u: AuthUser) {
    return this.whatsapp.listConversations(u.tenantId);
  }

  @Get('conversations/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.whatsapp.getConversation(u.tenantId, id);
  }

  @Post('conversations/:id/read')
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.whatsapp.markRead(u.tenantId, id);
  }

  @Post('messages')
  send(@CurrentUser() u: AuthUser, @Body() dto: SendMessageDto) {
    return this.whatsapp.sendText(u.tenantId, dto);
  }

  @Post('numbers')
  registerNumber(@CurrentUser() u: AuthUser, @Body() dto: RegisterNumberDto) {
    return this.whatsapp.registerNumber(u.tenantId, dto.phoneNumberId, dto.label);
  }

  /** Simula uma mensagem recebida (dev/demo, sem depender do webhook real). */
  @Post('simulate-inbound')
  simulate(@CurrentUser() u: AuthUser, @Body() dto: SimulateInboundDto) {
    return this.whatsapp.receiveInbound(u.tenantId, dto);
  }
}
