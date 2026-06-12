import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function parseBoolean(value: unknown): unknown {
  if (value === 'true' || value === true || value === 1 || value === '1') {
    return true;
  }
  if (value === 'false' || value === false || value === 0 || value === '0') {
    return false;
  }
  return value;
}

function parseNumber(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value);
  }
  return value;
}

export class CreateFuelEntryDto {
  @IsString()
  @MinLength(1)
  vehicleId!: string;

  @IsOptional()
  @IsDateString()
  enteredAt?: string;

  @Transform(({ value }) => parseNumber(value))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  liters!: number;

  @Transform(({ value }) => parseNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @Transform(({ value }) => parseNumber(value))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  isFullTank?: boolean;
}
