import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SendResult } from './whatsapp-provider';

/** Provider fake: não envia nada, só loga e devolve um id (dev/teste). */
@Injectable()
export class FakeWhatsAppProvider {
  private readonly logger = new Logger('FakeWhatsApp');

  async send(to: string, body: string): Promise<SendResult> {
    // Em produção, cair no provider "fake" significa que NÃO há WhatsApp real
    // configurado (nem por tenant, nem por env). Não mentimos "SENT" — marcamos
    // como FAILED e avisamos, para o operador perceber que precisa configurar o
    // WhatsApp (Meta/WAHA) nas Configurações, em vez de ver "enviado" sem envio.
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        `WhatsApp sem provider real configurado — mensagem NÃO enviada para ${to}. ` +
          `Configure Meta/WAHA nas Configurações da barbearia.`,
      );
      return { providerMessageId: '', status: 'FAILED' };
    }
    this.logger.log(`[FAKE] -> ${to}: ${body.slice(0, 60)}`);
    return { providerMessageId: `fake_${randomUUID()}`, status: 'SENT' };
  }
}
