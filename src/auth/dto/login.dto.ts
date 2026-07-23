import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  /** Slug da barbearia — resolve o tenant ANTES do email (ver rls/README.md). */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  slug: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;

  /** Código TOTP (6 dígitos) — exigido se o usuário tiver 2FA ativo. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;
}
