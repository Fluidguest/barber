import { Injectable, Logger } from '@nestjs/common';
import { SendResult, WahaConfig } from './whatsapp-provider';

/**
 * WhatsApp via WAHA (não-oficial, self-hosted) — ADR-003 (alternativa de custo).
 * Credenciais vêm por tenant (Configurações) com fallback no env.
 * ⚠️ Não-oficial: risco de ban do número. Ver docs/INTEGRATIONS.md.
 */
@Injectable()
export class WahaWhatsAppProvider {
  private readonly logger = new Logger('WahaWhatsApp');

  async send(to: string, body: string, cfg: WahaConfig): Promise<SendResult> {
    if (!cfg.url) {
      this.logger.error('WAHA_URL ausente');
      return { providerMessageId: '', status: 'FAILED' };
    }
    const session = cfg.session ?? 'default';
    const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;
    try {
      const res = await fetch(`${cfg.url.replace(/\/$/, '')}/api/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {}),
        },
        body: JSON.stringify({ session, chatId, text: body }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok) {
        this.logger.error(`Falha WAHA (${res.status})`);
        return { providerMessageId: '', status: 'FAILED' };
      }
      return { providerMessageId: data.id ?? '', status: 'SENT' };
    } catch (e) {
      this.logger.error(`Erro de rede WAHA: ${(e as Error).message}`);
      return { providerMessageId: '', status: 'FAILED' };
    }
  }
}
