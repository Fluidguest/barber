import { IsIn, IsNumber, Max, Min, ValidateIf } from 'class-validator';

/**
 * Acréscimo/desconto da comanda.
 * - `mode` null remove o ajuste.
 * - `value` assinado: **negativo = desconto**, **positivo = acréscimo**.
 * - PERCENT: em % (ex.: -10 = 10% de desconto). FIXED: em reais.
 */
export class SetAdjustmentDto {
  @IsIn(['PERCENT', 'FIXED', null])
  mode: 'PERCENT' | 'FIXED' | null;

  @ValidateIf((o) => o.mode !== null)
  @IsNumber()
  @Min(-100000)
  @Max(100000)
  value: number;
}
