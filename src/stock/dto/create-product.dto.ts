import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(60) sku?: string;
  @IsOptional() @IsString() @MaxLength(60) barcode?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(120) supplier?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(10) unit?: string;

  @IsOptional() @IsInt() @Min(0) costCents?: number;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;

  /** Estoque inicial (gera uma movimentação de entrada). */
  @IsOptional() @IsInt() @Min(0) stockCurrent?: number;
  @IsOptional() @IsInt() @Min(0) stockMin?: number;

  /** Validade (ISO). */
  @IsOptional() @IsISO8601() expiresAt?: string;
}
