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

/** Endereço do barbeiro (mesma forma do cliente). */
export class BarberAddressDto {
  @IsOptional() @IsString() @MaxLength(9) zip?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(2) state?: string;
}

export class CreateBarberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;

  /** CPF (apenas dígitos ou formatado) — cifrado em repouso. */
  @IsOptional() @IsString() @MaxLength(14) document?: string;

  /** Data de nascimento (YYYY-MM-DD). */
  @IsOptional() @IsISO8601() birthDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BarberAddressDto)
  address?: BarberAddressDto;

  /** Unidade. Se omitida, usa a unidade padrão (Matriz) do tenant. */
  @IsOptional()
  @IsString()
  unitId?: string;

  /** IDs de serviços que o barbeiro executa (especialidades). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  specialtyIds?: string[];
}
