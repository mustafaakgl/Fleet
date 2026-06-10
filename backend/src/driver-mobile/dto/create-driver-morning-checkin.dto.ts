import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDriverMorningCheckinDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  vehiclePlate!: string;

  @IsString()
  @MinLength(1)
  companyName!: string;

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
