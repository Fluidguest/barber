import { IsOptional, IsString } from 'class-validator';

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  barberId?: string;

  /** Vincula a comanda a um atendimento da agenda (opcional). */
  @IsOptional()
  @IsString()
  appointmentId?: string;
}
