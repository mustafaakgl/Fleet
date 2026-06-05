import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateDriverMorningCheckinDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cargoName?: string;

  @IsOptional()
  @IsString()
  cargoQuantity?: string;
}
