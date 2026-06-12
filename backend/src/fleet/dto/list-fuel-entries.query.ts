import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class ListFuelEntriesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  driverId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
