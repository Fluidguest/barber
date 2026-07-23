import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SendResult } from './whatsapp-provider';

/** Provider fake: não envia nada, só loga e devolve um id (dev/teste). */
@Injectable()
export class FakeWhatsAppProvider {
  private readonly logger = new Logger('FakeWhatsApp');

  async send(to: string, body: string): Promise<SendResult> {
    this.logger.log(`[FAKE] -> ${to}: ${body.slice(0, 60)}`);
    return { providerMessageId: `fake_${randomUUID()}`, status: 'SENT' };
  }
}
