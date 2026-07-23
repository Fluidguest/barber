import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { COMMISSION_TYPES } from './create-rule.dto';

export class UpdateRuleDto {
  @IsOptional()
  @IsIn(COMMISSION_TYPES)
  type?: (typeof COMMISSION_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
