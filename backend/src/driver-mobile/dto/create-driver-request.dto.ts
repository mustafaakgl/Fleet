import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

const REQUEST_TYPES = [
  'vacation',
  'sick_leave',
  'training',
  'business_trip',
  'doctor_appointment',
  'special_leave',
  'overtime_compensation',
  'free_day',
  'other',
] as const;

export class CreateDriverRequestDto {
  @IsEnum(REQUEST_TYPES)
  type!: (typeof REQUEST_TYPES)[number];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
