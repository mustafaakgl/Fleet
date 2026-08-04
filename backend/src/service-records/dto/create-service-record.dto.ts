import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateServiceRecordDto {
  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  /** Tamamlanma tarihi. */
  @IsDateString()
  date!: string;

  /** Servisin baslangici; tek gunluk islerde bos birakilabilir. */
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsString()
  @MinLength(1)
  service_type!: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  repair_company?: string;

  @IsNumber()
  @Min(0)
  cost_amount!: number;

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
