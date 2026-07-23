import { IsIn, IsString } from 'class-validator';

export const BILLING_EVENTS = ['approved', 'failed', 'suspend'] as const;

export class BillingWebhookDto {
  @IsString()
  externalId: string;

  @IsIn(BILLING_EVENTS)
  event: (typeof BILLING_EVENTS)[number];
}
