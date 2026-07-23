import { Type } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AddressDto {
  @IsOptional() @IsString() @MaxLength(9) zip?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(2) state?: string;
}

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;

  @IsOptional() @IsEmail() @MaxLength(180) email?: string;

  /** CPF (apenas dígitos ou formatado). */
  @IsOptional() @IsString() @MaxLength(14) document?: string;

  /** Data de nascimento (YYYY-MM-DD). */
  @IsOptional() @IsISO8601() birthDate?: string;

  @IsOptional() @IsString() @MaxLength(60) instagram?: string;

  /** Como o cliente conheceu a barbearia. */
  @IsOptional() @IsString() @MaxLength(80) origin?: string;

  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}
