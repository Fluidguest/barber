import { IsInt, IsOptional, Min } from 'class-validator';

export class OpenCashDto {
  /** Fundo de troco inicial em centavos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  openingCents?: number;
}
