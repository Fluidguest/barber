/**
 * Provider de pagamento da PLATAFORMA (ADR-006) — a assinatura que a barbearia
 * paga pelo SaaS. Não confundir com o gateway que a barbearia usa para cobrar
 * os clientes dela. Implementação real: Mercado Pago (preapproval).
 */
export interface CreateSubscriptionParams {
  tenantId: string;
  planSlug: string;
  priceCents: number;
}

export interface CreateSubscriptionResult {
  externalId: string; // ex.: preapproval_id do Mercado Pago
}

export interface PlatformPaymentProvider {
  createSubscription(p: CreateSubscriptionParams): Promise<CreateSubscriptionResult>;
  cancelSubscription(externalId: string): Promise<void>;
}

export const PLATFORM_PAYMENT_PROVIDER = Symbol('PLATFORM_PAYMENT_PROVIDER');
