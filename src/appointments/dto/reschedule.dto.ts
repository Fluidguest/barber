import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class RescheduleDto {
  @IsISO8601()
  startAt: string;

  /** Opcional: move o atendimento para outro barbeiro. */
  @IsOptional()
  @IsString()
  barberId?: string;
}
