import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const CATEGORY_KINDS = ['INCOME', 'EXPENSE'] as const;

export class CreateFinanceCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsIn(CATEGORY_KINDS)
  kind: (typeof CATEGORY_KINDS)[number];
}
