import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ListCommissionsDto {
  @IsOptional()
  @IsString()
  barberId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodRef deve ser YYYY-MM' })
  periodRef?: string;

  @IsOptional()
  @IsIn(['PENDING', 'CLOSED', 'PAID'])
  status?: string;
}
