import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateFinanceEntryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) description?: string;
  @IsOptional() @IsInt() @Min(1) amountCents?: number;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(80) costCenter?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
