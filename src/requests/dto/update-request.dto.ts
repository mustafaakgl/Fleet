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

const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export class UpdateRequestDto {
  @IsOptional()
  @IsEnum(REQUEST_TYPES)
  type?: (typeof REQUEST_TYPES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(REQUEST_STATUSES)
  status?: (typeof REQUEST_STATUSES)[number];
}
