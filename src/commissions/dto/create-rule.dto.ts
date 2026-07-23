import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const COMMISSION_TYPES = ['PERCENT', 'FIXED'] as const;

export class CreateRuleDto {
  /** Barbeiro específico. Se omitido, é a regra PADRÃO do tenant. */
  @IsOptional()
  @IsString()
  barberId?: string;

  @IsIn(COMMISSION_TYPES)
  type: (typeof COMMISSION_TYPES)[number];

  /** PERCENT: base 10000 (40% = 4000). FIXED: centavos por item. */
  @IsInt()
  @Min(0)
  value: number;
}
