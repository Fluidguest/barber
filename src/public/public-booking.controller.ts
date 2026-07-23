import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicBookingService } from './public-booking.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

/**
 * Agendamento online — endpoints **públicos** (sem autenticação), acessados
 * pela página que a barbearia divulga (link/QR code).
 *
 * Cuidados por serem abertos:
 *  - **rate limit** próprio, bem mais rígido que o global;
 *  - só devolvem dado público (serviços, profissionais, horários livres);
 *  - nunca expõem cliente, faturamento ou qualquer dado interno;
 *  - a barbearia é resolvida pelo `slug` e precisa estar ativa.
 */
@Controller('public/:slug')
export class PublicBookingController {
  constructor(private readonly booking: PublicBookingService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  shop(@Param('slug') slug: string) {
    return this.booking.getShop(slug);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('services')
  services(@Param('slug') slug: string) {
    return this.booking.listServices(slug);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('barbers')
  barbers(@Param('slug') slug: string, @Query('serviceId') serviceId?: string) {
    return this.booking.listBarbers(slug, serviceId);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('availability')
  availability(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
    @Query('barberId') barberId?: string,
  ) {
    return this.booking.availability(slug, date, serviceId, barberId);
  }

  /** Criação de agendamento: o mais sensível — limite baixo por IP. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('appointments')
  book(@Param('slug') slug: string, @Body() dto: CreatePublicAppointmentDto) {
    return this.booking.book(slug, dto);
  }
}
