import { TripPurpose } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetTripPurposeDto {
  @IsEnum(TripPurpose)
  purpose!: TripPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
