import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  PlatformPaymentProvider,
} from './payment-provider';

/**
 * Provider fake: simula a criação de assinatura sem cobrar. A confirmação de
 * pagamento chega depois via webhook (POST /billing/webhook), como no MP real.
 */
@Injectable()
export class FakePaymentProvider implements PlatformPaymentProvider {
  private readonly logger = new Logger('FakePayment');

  async createSubscription(
    p: CreateSubscriptionParams,
  ): Promise<CreateSubscriptionResult> {
    const externalId = `mp_fake_${randomUUID()}`;
    this.logger.log(`[FAKE] assinatura ${p.planSlug} p/ tenant ${p.tenantId} -> ${externalId}`);
    return { externalId };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    this.logger.log(`[FAKE] cancelando assinatura ${externalId}`);
  }
}
