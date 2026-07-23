import { IsString } from 'class-validator';

export class SubscribeDto {
  @IsString()
  planId: string;
}
