import { IsInt, IsOptional } from 'class-validator';

/**
 * Ajuste do saldo de desconto do cliente (em centavos).
 * - `setCents`: define o saldo absoluto.
 * - `addCents`: soma (positivo) ou subtrai (negativo) do saldo atual.
 * Informe um dos dois. O saldo nunca fica negativo.
 */
export class AdjustDiscountBalanceDto {
  @IsOptional()
  @IsInt()
  setCents?: number;

  @IsOptional()
  @IsInt()
  addCents?: number;
}
