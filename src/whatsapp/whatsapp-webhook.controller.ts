import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

/**
 * Webhook PÚBLICO da Meta (Cloud API).
 *  - GET: responde ao desafio de verificação (hub.challenge).
 *  - POST: ingere mensagens recebidas. Resolve o tenant pelo phone_number_id
 *    (mapeado em whatsapp_numbers) via conexão de sistema — mesmo padrão do
 *    webhook de billing. Sempre responde 200 (a Meta re-tenta em erro).
 *
 * ⚠️ Ativação real exige credencial Meta + URL pública (túnel/HTTPS). Aqui o
 * fluxo é testável com payload simulado (ver test/whatsapp.e2e-spec.ts).
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhook');

  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && token && token === expected) {
      return challenge;
    }
    return 'forbidden';
  }

  @Post()
  async receive(@Body() payload: any) {
    try {
      const changes = payload?.entry?.flatMap((e: any) => e?.changes ?? []) ?? [];
      for (const change of changes) {
        const value = change?.value ?? {};
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const tenantId = await this.whatsapp.resolveTenantByNumber(phoneNumberId);
        if (!tenantId) {
          this.logger.warn(`Número não mapeado: ${phoneNumberId}`);
          continue;
        }
        const name = value?.contacts?.[0]?.profile?.name;
        for (const m of value?.messages ?? []) {
          await this.whatsapp.receiveInbound(tenantId, {
            from: m.from,
            name,
            body: m.text?.body ?? m[m.type]?.caption,
            contentType: mapType(m.type),
            providerMessageId: m.id,
          });
        }
      }
    } catch (e) {
      this.logger.error(`Erro processando webhook: ${(e as Error).message}`);
    }
    return { received: true };
  }
}

function mapType(t?: string): string {
  switch (t) {
    case 'audio':
      return 'AUDIO';
    case 'image':
      return 'IMAGE';
    case 'document':
      return 'DOCUMENT';
    case 'video':
      return 'VIDEO';
    case 'sticker':
      return 'STICKER';
    case 'location':
      return 'LOCATION';
    default:
      return 'TEXT';
  }
}
