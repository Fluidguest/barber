import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class ListAppointmentsDto {
  /** Início da janela (ISO). Default: agora. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Fim da janela (ISO). Default: from + 30 dias. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  barberId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELED', 'NO_SHOW'])
  status?: string;
}
