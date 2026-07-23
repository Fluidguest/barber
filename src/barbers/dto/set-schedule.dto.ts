import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleItemDto {
  /** 0=Domingo ... 6=Sábado. */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(HHMM, { message: 'startTime deve ser HH:mm' })
  startTime: string;

  @Matches(HHMM, { message: 'endTime deve ser HH:mm' })
  endTime: string;
}

export class SetScheduleDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  items: ScheduleItemDto[];
}
