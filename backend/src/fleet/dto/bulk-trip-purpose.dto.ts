import { TripPurpose } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class BulkTripPurposeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tripIds!: string[];

  @IsEnum(TripPurpose)
  purpose!: TripPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
