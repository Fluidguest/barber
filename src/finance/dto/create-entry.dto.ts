import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const FINANCE_TYPES = ['PAYABLE', 'RECEIVABLE'] as const;
export const FINANCE_METHODS = [
  'CASH',
  'PIX',
  'CREDIT',
  'DEBIT',
  'BOLETO',
  'TRANSFER',
  'OTHER',
] as const;

export class CreateFinanceEntryDto {
  @IsIn(FINANCE_TYPES)
  type: (typeof FINANCE_TYPES)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description: string;

  /** Valor em centavos (> 0). */
  @IsInt()
  @Min(1)
  amountCents: number;

  /** Vencimento (ISO). */
  @IsISO8601()
  dueDate: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string;

  @IsOptional()
  @IsIn(FINANCE_METHODS)
  method?: (typeof FINANCE_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
