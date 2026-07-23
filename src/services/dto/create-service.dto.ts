import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Duração em minutos (5 a 600). */
  @IsInt()
  @Min(5)
  @Max(600)
  durationMin: number;

  /** Preço em centavos (>= 0). */
  @IsInt()
  @Min(0)
  priceCents: number;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
