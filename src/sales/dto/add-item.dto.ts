import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddItemDto {
  /** Se informado, puxa nome e preço do serviço (podem ser sobrescritos). */
  @IsOptional()
  @IsString()
  serviceId?: string;

  /** Se informado, é venda de produto: puxa nome/preço e BAIXA o estoque. */
  @IsOptional()
  @IsString()
  productId?: string;

  /** Obrigatório para item avulso (sem serviceId). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  /** Obrigatório para item avulso (sem serviceId). Centavos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  /** Barbeiro que executou (base para comissão futura). */
  @IsOptional()
  @IsString()
  barberId?: string;
}
