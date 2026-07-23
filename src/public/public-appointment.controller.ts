import { Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicAppointmentService } from './public-appointment.service';

/**
 * Auto-atendimento pelo link do lembrete — **público**, autorizado pelo token
 * assinado na própria URL. Sem login: o cliente não tem conta no sistema.
 */
@Controller('public/appointments/:token')
export class PublicAppointmentController {
  constructor(private readonly appointments: PublicAppointmentService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  get(@Param('token') token: string) {
    return this.appointments.get(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('confirm')
  confirm(@Param('token') token: string) {
    return this.appointments.confirm(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('cancel')
  cancel(@Param('token') token: string) {
    return this.appointments.cancel(token);
  }
}
