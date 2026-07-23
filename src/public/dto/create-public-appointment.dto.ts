import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePublicAppointmentDto {
  @IsString()
  @MinLength(2, { message: 'Informe seu nome' })
  @MaxLength(80)
  name: string;

  /** Aceita máscara: normalizado para só dígitos no serviço. */
  @IsString()
  @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Telefone inválido' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  barberId: string;

  @IsISO8601({}, { message: 'Data/hora inválida' })
  startAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}
