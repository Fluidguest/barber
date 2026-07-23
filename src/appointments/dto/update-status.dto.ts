import { IsIn } from 'class-validator';

export const APPOINTMENT_TRANSITIONS = [
  'CONFIRMED',
  'DONE',
  'NO_SHOW',
  'CANCELED',
] as const;

export class UpdateStatusDto {
  @IsIn(APPOINTMENT_TRANSITIONS)
  status: (typeof APPOINTMENT_TRANSITIONS)[number];
}
