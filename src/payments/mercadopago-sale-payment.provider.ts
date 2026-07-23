import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ChargeResult,
  ChargeStatusResult,
  CreateChargeInput,
  PaymentConfig,
  SalePaymentProvider,
} from './sale-payment.provider';

const API = 'https://api.mercadopago.com';

/**
 * Mercado Pago — cobrança PIX (API de Pagamentos).
 *
 * Doc: POST /v1/payments com `payment_method_id: "pix"` devolve, em
 * `point_of_interaction.transaction_data`, o `qr_code` (copia-e-cola) e o
 * `qr_code_base64` (imagem). A confirmação chega por webhook, e também
 * conferimos por consulta (GET /v1/payments/:id) — cinto e suspensório.
 *
 * O access token vem das configurações do tenant (cifrado) ou do env.
 */
@Injectable()
export class MercadoPagoSalePaymentProvider implements SalePaymentProvider {
  private readonly logger = new Logger('MercadoPago');

  async createPixCharge(
    input: CreateChargeInput,
    cfg: PaymentConfig,
  ): Promise<ChargeResult> {
    if (!cfg.accessToken) {
      throw new BadRequestException(
        'Mercado Pago não configurado: informe o access token em Configurações',
      );
    }
    const expiration = new Date(Date.now() + input.expiresInMin * 60_000);

    const res = await fetch(`${API}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
        // Evita cobrança duplicada se a requisição for repetida.
        'X-Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: Number((input.amountCents / 100).toFixed(2)),
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.externalReference,
        date_of_expiration: expiration.toISOString(),
        payer: { email: input.payerEmail ?? 'cliente@example.com' },
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`Falha ao criar cobrança: ${res.status} ${JSON.stringify(body)}`);
      throw new BadRequestException(
        body?.message ?? 'Não foi possível gerar a cobrança PIX',
      );
    }

    const tx = body?.point_of_interaction?.transaction_data ?? {};
    return {
      externalId: String(body.id),
      qrCode: tx.qr_code,
      qrCodeBase64: tx.qr_code_base64,
      ticketUrl: tx.ticket_url,
      expiresAt: expiration,
      status: mapStatus(body.status) === 'APPROVED' ? 'APPROVED' : 'PENDING',
    };
  }

  async getChargeStatus(
    externalId: string,
    cfg: PaymentConfig,
  ): Promise<ChargeStatusResult> {
    if (!cfg.accessToken) return { status: 'PENDING' };
    const res = await fetch(`${API}/v1/payments/${externalId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Consulta falhou (${res.status}) para ${externalId}`);
      return { status: 'PENDING' };
    }
    return {
      status: mapStatus(body.status),
      paidAt: body.date_approved ? new Date(body.date_approved) : undefined,
      amountCents: body.transaction_amount
        ? Math.round(body.transaction_amount * 100)
        : undefined,
    };
  }
}

/** Status do Mercado Pago → nosso enum. */
function mapStatus(s?: string): ChargeStatusResult['status'] {
  switch (s) {
    case 'approved':
      return 'APPROVED';
    case 'cancelled':
      return 'CANCELED';
    case 'rejected':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'PENDING'; // pending / in_process / authorized
  }
}
