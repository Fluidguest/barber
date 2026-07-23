import { IsInt, Min } from 'class-validator';

export class CloseCashDto {
  /** Valor contado em dinheiro no fechamento (centavos). */
  @IsInt()
  @Min(0)
  closingCents: number;
}
