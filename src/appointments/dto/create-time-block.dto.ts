import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTimeBlockDto {
  /** Barbeiro específico. Se omitido, bloqueia a unidade inteira. */
  @IsOptional()
  @IsString()
  barberId?: string;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
