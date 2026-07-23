import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SaleChargesController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { FakeSalePaymentProvider } from './fake-sale-payment.provider';
import { MercadoPagoSalePaymentProvider } from './mercadopago-sale-payment.provider';
import { SettingsModule } from '../settings/settings.module';

/** Cobrança do cliente final no PDV (PIX). Ver `billing/` para a assinatura. */
@Module({
  imports: [SettingsModule],
  controllers: [SaleChargesController, PaymentsWebhookController],
  providers: [PaymentsService, FakeSalePaymentProvider, MercadoPagoSalePaymentProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
