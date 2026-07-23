import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  clientId: string;

  @IsString()
  barberId: string;

  @IsString()
  serviceId: string;

  /** Início em ISO 8601 (UTC). Ex.: "2026-07-20T13:00:00.000Z". */
  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
