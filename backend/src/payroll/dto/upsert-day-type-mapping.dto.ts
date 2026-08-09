import { PayrollDayType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertDayTypeMappingDto {
  /** CalendarEvent.uiStatus veya CalendarStatus degeri; ilki serbest metin. */
  @IsString() @MaxLength(40) calendarCode!: string;
  @IsEnum(PayrollDayType) dayType!: PayrollDayType;
  @IsOptional() @IsBoolean() paid?: boolean;
}
