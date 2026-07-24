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
import { BankDataDto, BarberAddressDto } from './create-barber.dto';

/** Edição completa do barbeiro — todos os campos opcionais (atualização parcial). */
export class UpdateBarberDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  // CPF, quando informado, ainda é validado; omitir mantém o atual.
  @IsOptional() @IsString() @MaxLength(14) document?: string;
  @IsOptional() @IsISO8601() birthDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BarberAddressDto)
  address?: BarberAddressDto;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(140) pixKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDataDto)
  bankData?: BankDataDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  specialtyIds?: string[];
}
