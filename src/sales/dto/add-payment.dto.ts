import { IsIn, IsInt, Min } from 'class-validator';

export const PAYMENT_METHODS = [
  'CASH',
  'PIX',
  'CREDIT',
  'DEBIT',
  'LINK',
] as const;

export class AddPaymentDto {
  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @IsInt()
  @Min(1)
  amountCents: number;
}
