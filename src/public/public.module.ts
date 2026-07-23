import { Module } from '@nestjs/common';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicAppointmentController } from './public-appointment.controller';
import { PublicAppointmentService } from './public-appointment.service';
import { NotificationsModule } from '../notifications/notifications.module';

/** Área pública (sem autenticação): agendamento online + link do lembrete. */
@Module({
  imports: [NotificationsModule],
  // Ordem importa: `public/appointments/:token` precisa ser avaliado ANTES de
  // `public/:slug`, senão uma barbearia com slug "appointments" capturaria a rota.
  controllers: [PublicAppointmentController, PublicBookingController],
  providers: [PublicBookingService, PublicAppointmentService],
})
export class PublicModule {}
