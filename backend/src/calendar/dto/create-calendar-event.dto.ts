import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CalendarStatus } from '@prisma/client';

export class CreateCalendarEventDto {
  @IsString()
  driver_id!: string;

  @IsDateString()
  date!: string;

  @IsEnum(CalendarStatus)
  status!: CalendarStatus;

  @IsOptional()
  @IsString()
  assignment_id?: string;

  /** Original UI abbreviation (SU, PU, …) for round-trip display. */
  @IsOptional()
  @IsString()
  ui_status?: string;
}
