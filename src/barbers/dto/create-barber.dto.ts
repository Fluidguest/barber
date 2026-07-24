import {
  ArrayUnique,
  IsArray,
  IsDefined,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsCPF } from '../../common/cpf.validator';

/** Endereço COMPLETO do barbeiro (obrigatório no cadastro; complemento opcional). */
export class BarberAddressDto {
  @IsString() @IsNotEmpty({ message: 'CEP é obrigatório' }) @MaxLength(9) zip: string;
  @IsString() @IsNotEmpty({ message: 'Rua é obrigatória' }) @MaxLength(120) street: string;
  @IsString() @IsNotEmpty({ message: 'Número é obrigatório' }) @MaxLength(20) number: string;
  @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @IsString() @IsNotEmpty({ message: 'Bairro é obrigatório' }) @MaxLength(80) neighborhood: string;
  @IsString() @IsNotEmpty({ message: 'Cidade é obrigatória' }) @MaxLength(80) city: string;
  @IsString() @IsNotEmpty({ message: 'UF é obrigatória' }) @MaxLength(2) state: string;
}

/** Dados bancários do barbeiro (todos OPCIONAIS). */
export class BankDataDto {
  @IsOptional() @IsString() @MaxLength(80) bank?: string;
  @IsOptional() @IsString() @MaxLength(20) agency?: string;
  @IsOptional() @IsString() @MaxLength(30) account?: string;
  @IsOptional() @IsString() @MaxLength(20) accountType?: string; // corrente | poupança
  @IsOptional() @IsString() @MaxLength(120) holder?: string;     // titular
}

export class CreateBarberDto {
  // ---- Obrigatórios ----
  @IsString()
  @MinLength(2, { message: 'Informe o nome completo' })
  @MaxLength(120)
  name: string;

  @IsCPF({ message: 'CPF inválido' })
  document: string;

  @IsISO8601({}, { message: 'Data de nascimento inválida' })
  @IsNotEmpty({ message: 'Data de nascimento é obrigatória' })
  birthDate: string;

  @IsDefined({ message: 'Endereço é obrigatório' })
  @ValidateNested()
  @Type(() => BarberAddressDto)
  address: BarberAddressDto;

  // ---- Opcionais ----
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;

  /** Chave PIX (opcional). */
  @IsOptional() @IsString() @MaxLength(140) pixKey?: string;

  /** Dados bancários (opcionais). */
  @IsOptional()
  @ValidateNested()
  @Type(() => BankDataDto)
  bankData?: BankDataDto;

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
