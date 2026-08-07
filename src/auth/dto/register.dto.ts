import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_MAX, SLUG_MESSAGE, SLUG_MIN, SLUG_REGEX } from './slug';

export class RegisterDto {
  /** Nome da barbearia (tenant). */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  barbershopName: string;

  /** Slug único da barbearia (subdomínio). Ex.: "barbearia-do-ze". */
  @IsString()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  @MinLength(SLUG_MIN)
  @MaxLength(SLUG_MAX)
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
