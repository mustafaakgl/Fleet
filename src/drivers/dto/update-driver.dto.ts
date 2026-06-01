import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(RiskLevel)
  risk_level?: RiskLevel;

  @IsOptional()
  @IsString()
  notes?: string;
}
