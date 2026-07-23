import { IsOptional, IsString, Matches } from 'class-validator';

export class ClosePeriodDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodRef deve ser YYYY-MM' })
  periodRef: string;

  /** Fecha só de um barbeiro. Omitido = todos. */
  @IsOptional()
  @IsString()
  barberId?: string;
}
