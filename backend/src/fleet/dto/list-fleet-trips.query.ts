import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListFleetTripsQueryDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
