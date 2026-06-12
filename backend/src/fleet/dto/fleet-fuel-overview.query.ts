import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class FleetFuelOverviewQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleId?: string;
}
