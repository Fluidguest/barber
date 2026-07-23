import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_ROLES } from './create-user.dto';

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional() @IsIn(USER_ROLES) role?: (typeof USER_ROLES)[number];

  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Redefinição de senha (opcional). */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string;
}
