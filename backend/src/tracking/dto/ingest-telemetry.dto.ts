import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const TELEMETRY_EVENT_TYPES = [
  'speeding',
  'harsh_accel',
  'harsh_brake',
  'harsh_corner',
  'crash',
] as const;

const DTC_SEVERITIES = ['medium', 'critical'] as const;

export class IngestTelemetryEventDto {
  @IsIn(TELEMETRY_EVENT_TYPES)
  type!: (typeof TELEMETRY_EVENT_TYPES)[number];

  @Type(() => Number)
  @IsNumber()
  value!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number;
}

export class IngestTelemetryDtcDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(DTC_SEVERITIES)
  severity!: (typeof DTC_SEVERITIES)[number];
}

export class IngestTelemetryDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  imei?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  recordedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speedMps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ignition?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fuelLevelPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  coolantTemp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  voltage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  odometerKm?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestTelemetryEventDto)
  events?: IngestTelemetryEventDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestTelemetryDtcDto)
  dtc?: IngestTelemetryDtcDto[];
}
