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
import { AddressDto } from './create-client.dto';

/** Atualização parcial de cliente — todos os campos opcionais. */
export class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(14) document?: string;
  @IsOptional() @IsISO8601() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(60) instagram?: string;
  @IsOptional() @IsString() @MaxLength(80) origin?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}
