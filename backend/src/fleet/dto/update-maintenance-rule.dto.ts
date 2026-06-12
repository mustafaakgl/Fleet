import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateMaintenanceRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  intervalKm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  lastDoneAtKm?: number | null;

  @IsOptional()
  @IsDateString()
  lastDoneAtDate?: string | null;
}
