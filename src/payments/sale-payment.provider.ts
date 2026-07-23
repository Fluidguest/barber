/**
 * Cobrança do CLIENTE FINAL no PDV (não confundir com `billing/`, que cobra a
 * assinatura da barbearia). Mesmo padrão dos demais: interface + `fake` padrão
 * + provedor real plugado por configuração.
 */

export interface PaymentConfig {
  provider: string; // fake | mercadopago
  accessToken?: string;
  webhookSecret?: string;
}

export interface CreateChargeInput {
  amountCents: number;
  description: string;
  /** Referência nossa (id da cobrança) — volta no webhook. */
  externalReference: string;
  /** Minutos até expirar (PIX). */
  expiresInMin: number;
  payerEmail?: string;
}

export interface ChargeResult {
  externalId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: Date;
  status: 'PENDING' | 'APPROVED' | 'FAILED';
}

export interface ChargeStatusResult {
  status: 'PENDING' | 'APPROVED' | 'EXPIRED' | 'CANCELED' | 'FAILED';
  paidAt?: Date;
  amountCents?: number;
}

export interface SalePaymentProvider {
  /** Cria uma cobrança PIX e devolve o QR code. */
  createPixCharge(input: CreateChargeInput, cfg: PaymentConfig): Promise<ChargeResult>;
  /** Consulta a situação atual da cobrança no provedor. */
  getChargeStatus(externalId: string, cfg: PaymentConfig): Promise<ChargeStatusResult>;
}
