import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { WahaWhatsAppProvider } from './waha-whatsapp.provider';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [SettingsModule, StorageModule], // credenciais por tenant + mídia
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppSenderService,
    FakeWhatsAppProvider,
    MetaWhatsAppProvider,
    WahaWhatsAppProvider,
  ],
  // Exporta o sender para as notificações (lembretes) reutilizarem o envio.
  exports: [WhatsAppSenderService],
})
export class WhatsAppModule {}
