import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateServiceRecordDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  service_type?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  repair_company?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_amount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage_km?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  driver_id?: string;
}
