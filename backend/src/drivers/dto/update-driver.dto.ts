import { IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { DriverStatus, RiskLevel } from '@prisma/client';

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  last_name?: string;

  @IsOptional()
  @IsString()
  employee_number?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  license_number?: string;

  @IsOptional()
  @IsDateString()
  license_expiry_date?: string;

  @IsOptional()
  @IsString()
  passport_number?: string;

  @IsOptional()
  @IsDateString()
  passport_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  home_address_street?: string;

  @IsOptional()
  @IsString()
  home_address_zip_code?: string;

  @IsOptional()
  @IsString()
  home_address_city?: string;

  @IsOptional()
  @IsString()
  home_address_country?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(RiskLevel)
  risk_level?: RiskLevel;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  vacation_entitlement_days?: number;

  @IsOptional()
  @IsNumber()
  @Min(-365)
  @Max(365)
  vacation_carry_over_days?: number;
}
