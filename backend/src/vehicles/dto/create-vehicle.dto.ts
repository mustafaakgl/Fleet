import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  plate_number!: string;

  @IsString()
  @MinLength(1)
  brand!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  internal_code?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsString()
  current_driver_id?: string;

  @IsOptional()
  @IsDateString()
  tuv_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  sp_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  insurance_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  registration_expiry_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
