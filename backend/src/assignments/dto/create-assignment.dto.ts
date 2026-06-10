import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicle_plate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  company_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  company_name?: string;

  @IsString()
  @MinLength(1)
  cargo_name!: string;

  @IsString()
  @MinLength(1)
  cargo_owner!: string;

  @IsString()
  @MinLength(1)
  pickup_address!: string;

  @IsString()
  @MinLength(1)
  delivery_address!: string;

  @IsDateString()
  work_date!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be HH:MM (24h)' })
  start_time!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be HH:MM (24h)' })
  end_time!: string;

  @IsOptional()
  @IsString()
  route_name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expected_daily_revenue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  acknowledge_license_compliance_warning?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledge_vehicle_defect_warning?: boolean;
}
