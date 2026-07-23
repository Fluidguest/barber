import { Module } from '@nestjs/common';
import { BillingController, BillingWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { FakePaymentProvider } from './fake-payment.provider';
import { PLATFORM_PAYMENT_PROVIDER } from './payment-provider';

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    // SystemPrismaService vem do PrismaModule (global).
    // Troque por MercadoPagoProvider quando houver credencial.
    { provide: PLATFORM_PAYMENT_PROVIDER, useClass: FakePaymentProvider },
  ],
})
export class BillingModule {}
