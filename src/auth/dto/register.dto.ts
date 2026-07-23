import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  /** Nome da barbearia (tenant). */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  barbershopName: string;

  /** Slug único da barbearia (subdomínio). Ex.: "barbearia-do-ze". */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug deve ser minúsculo, sem espaços (ex.: barbearia-do-ze)',
  })
  @MinLength(2)
  @MaxLength(60)
  slug: string;

  /** Nome do administrador. */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  adminName: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
