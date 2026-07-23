import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { FINANCE_METHODS } from './create-entry.dto';

export class PayEntryDto {
  @IsOptional()
  @IsIn(FINANCE_METHODS)
  method?: (typeof FINANCE_METHODS)[number];

  /** Data do pagamento (ISO). Default: agora. */
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
