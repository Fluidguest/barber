import { Body, Controller, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';

/**
 * Webhook de pagamento — **público** (o Mercado Pago chama sem token nosso).
 *
 * Nunca confiamos no corpo: dele tiramos só o **id** da cobrança e vamos
 * consultar o provedor para saber a situação real. Assim, mesmo que alguém
 * forje uma chamada, o desfecho vem da fonte oficial.
 *
 * Sempre responde 200: provedores reenviam em qualquer outro status, e
 * reprocessar é seguro (o `settle` é idempotente).
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  private readonly logger = new Logger('PaymentsWebhook');

  constructor(private readonly payments: PaymentsService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post()
  async receive(
    @Body() body: Record<string, any>,
    @Query('id') queryId?: string,
    @Query('type') queryType?: string,
  ) {
    // Formatos aceitos pelo Mercado Pago:
    //   { type: 'payment', data: { id } }  |  ?type=payment&id=123
    const type = body?.type ?? body?.topic ?? queryType;
    const id = String(body?.data?.id ?? body?.id ?? queryId ?? '');

    if (!id || (type && type !== 'payment')) {
      return { received: true, ignored: true };
    }

    try {
      await this.payments.handleWebhook(id);
    } catch (err) {
      // Log e 200: erro nosso não deve virar retry infinito do provedor.
      this.logger.error(`Falha ao processar webhook ${id}: ${(err as Error).message}`);
    }
    return { received: true };
  }
}
