import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_LOCATION_BATCH_SIZE } from '../core/fleet-trip-locations.util';

export class FleetTripLocationPointInputDto {
  @IsString()
  recordedAt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speedKmh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyM?: number;
}

export class BatchFleetTripLocationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LOCATION_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => FleetTripLocationPointInputDto)
  points!: FleetTripLocationPointInputDto[];
}
