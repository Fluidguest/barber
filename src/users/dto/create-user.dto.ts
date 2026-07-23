import {
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const USER_ROLES = [
  'ADMIN',
  'MANAGER',
  'RECEPTION',
  'BARBER',
  'FINANCE',
  'MARKETING',
] as const;

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsIn(USER_ROLES)
  role: (typeof USER_ROLES)[number];
}
