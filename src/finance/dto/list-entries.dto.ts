import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';
import { FINANCE_TYPES } from './create-entry.dto';

export class ListEntriesDto {
  @IsOptional()
  @IsIn(FINANCE_TYPES)
  type?: (typeof FINANCE_TYPES)[number];

  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'CANCELED'])
  status?: string;

  /** Campo de data para o filtro from/to. */
  @IsOptional()
  @IsIn(['dueDate', 'paidAt'])
  dateField?: 'dueDate' | 'paidAt';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Paginação opt-in: com `page` retorna envelope; sem, retorna array. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
