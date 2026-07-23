import { Injectable, Logger } from '@nestjs/common';
import { MetaConfig, SendResult } from './whatsapp-provider';

/**
 * WhatsApp via API OFICIAL da Meta (Cloud API) — ADR-003 (default recomendado).
 * Credenciais vêm por tenant (Configurações) com fallback no env. Sem SDK: fetch.
 */
@Injectable()
export class MetaWhatsAppProvider {
  private readonly logger = new Logger('MetaWhatsApp');

  async send(to: string, body: string, cfg: MetaConfig): Promise<SendResult> {
    if (!cfg.token || !cfg.phoneId) {
      this.logger.error('Credenciais Meta ausentes (token/phoneId)');
      return { providerMessageId: '', status: 'FAILED' };
    }
    const apiVersion = cfg.apiVersion ?? 'v21.0';
    try {
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${cfg.phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/\D/g, ''),
            type: 'text',
            text: { body },
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: unknown;
      };
      if (!res.ok) {
        this.logger.error(`Falha Meta (${res.status}): ${JSON.stringify(data.error)}`);
        return { providerMessageId: '', status: 'FAILED' };
      }
      return { providerMessageId: data.messages?.[0]?.id ?? '', status: 'SENT' };
    } catch (e) {
      this.logger.error(`Erro de rede Meta: ${(e as Error).message}`);
      return { providerMessageId: '', status: 'FAILED' };
    }
  }
}
