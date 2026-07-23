import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BarberAddressDto } from './create-barber.dto';

/** Cadastro do barbeiro com todos os campos opcionais (atualização parcial). */
export class UpdateBarberDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;

  /** CPF (dígitos ou formatado) — cifrado em repouso. String vazia limpa. */
  @IsOptional() @IsString() @MaxLength(14) document?: string;

  @IsOptional() @IsISO8601() birthDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BarberAddressDto)
  address?: BarberAddressDto;

  /** Se informado, substitui a lista de especialidades. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  specialtyIds?: string[];
}
