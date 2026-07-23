import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { FakeWhatsAppProvider } from './fake-whatsapp.provider';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { WahaWhatsAppProvider } from './waha-whatsapp.provider';
import { SendResult } from './whatsapp-provider';

/**
 * Camada de ENVIO — resolve o provider e as credenciais POR TENANT
 * (Configurações da barbearia, com fallback no env). Usada pelo inbox e pelos
 * lembretes.
 */
@Injectable()
export class WhatsAppSenderService {
  constructor(
    private readonly settings: SettingsService,
    private readonly fake: FakeWhatsAppProvider,
    private readonly meta: MetaWhatsAppProvider,
    private readonly waha: WahaWhatsAppProvider,
  ) {}

  async sendText(tenantId: string, to: string, body: string): Promise<SendResult> {
    const cfg = await this.settings.getWhatsAppConfig(tenantId);
    switch (cfg.provider) {
      case 'meta':
        return this.meta.send(to, body, cfg.meta);
      case 'waha':
        return this.waha.send(to, body, cfg.waha);
      default:
        return this.fake.send(to, body);
    }
  }
}
