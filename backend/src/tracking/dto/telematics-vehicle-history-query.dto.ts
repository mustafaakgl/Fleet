import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

const TELEMETRY_METRICS = [
  'speedKmh',
  'rpm',
  'fuelLevelPct',
  'coolantTemp',
  'voltage',
  'odometerKm',
] as const;

export class TelematicsVehicleHistoryQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(TELEMETRY_METRICS)
  metric?: (typeof TELEMETRY_METRICS)[number];

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(2000)
  limit?: number;
}
