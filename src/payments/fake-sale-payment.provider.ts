import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ChargeResult,
  ChargeStatusResult,
  CreateChargeInput,
  PaymentConfig,
  SalePaymentProvider,
} from './sale-payment.provider';

/**
 * Provider padrão (dev/teste/demo): devolve um QR falso e mantém a cobrança
 * PENDENTE até ser aprovada manualmente (endpoint de simulação). Permite rodar
 * e testar o fluxo inteiro do PDV sem credencial do Mercado Pago.
 */
@Injectable()
export class FakeSalePaymentProvider implements SalePaymentProvider {
  private readonly logger = new Logger('FakePayment');
  /** Situação em memória, por externalId. */
  private readonly state = new Map<string, ChargeStatusResult>();

  async createPixCharge(
    input: CreateChargeInput,
    _cfg: PaymentConfig,
  ): Promise<ChargeResult> {
    const externalId = `fake_${randomUUID()}`;
    this.state.set(externalId, { status: 'PENDING' });
    this.logger.log(
      `[fake] cobrança ${externalId} de ${(input.amountCents / 100).toFixed(2)}`,
    );
    return {
      externalId,
      // "copia-e-cola" ilustrativo — não é um PIX válido de verdade.
      qrCode: `00020126FAKE-PIX-${input.externalReference}-${input.amountCents}`,
      qrCodeBase64: undefined,
      expiresAt: new Date(Date.now() + input.expiresInMin * 60_000),
      status: 'PENDING',
    };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    return this.state.get(externalId) ?? { status: 'PENDING' };
  }

  /** Só no provider fake: marca como paga (usado pelo botão "simular pagamento"). */
  approve(externalId: string) {
    this.state.set(externalId, { status: 'APPROVED', paidAt: new Date() });
  }
}
