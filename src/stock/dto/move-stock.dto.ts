import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const MOVEMENT_TYPES = ['IN', 'OUT'] as const;
export const MOVEMENT_REASONS = [
  'compra',
  'venda',
  'consumo',
  'perda',
  'inventario',
  'ajuste',
] as const;

export class MoveStockDto {
  @IsIn(MOVEMENT_TYPES)
  type: (typeof MOVEMENT_TYPES)[number];

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsIn(MOVEMENT_REASONS)
  reason?: (typeof MOVEMENT_REASONS)[number];

  /** Custo unitário na entrada (centavos). */
  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class AdjustStockDto {
  /** Novo estoque contado (inventário). Gera IN/OUT conforme a diferença. */
  @IsInt()
  @Min(0)
  targetStock: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
