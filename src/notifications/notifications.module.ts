import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule], // usa o WhatsAppSenderService p/ enviar os lembretes
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // usado por AppointmentsModule
})
export class NotificationsModule {}
