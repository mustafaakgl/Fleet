import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateMaintenanceRuleDto {
  @IsString()
  @MinLength(1)
  vehicleId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  intervalKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;
}
