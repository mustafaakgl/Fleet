import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MorningCheckinStatus } from '@prisma/client';

export class CreateMorningCheckinDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  vehicle_plate?: string;

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsEnum(MorningCheckinStatus)
  status?: MorningCheckinStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cargo_name?: string;

  @IsOptional()
  @IsString()
  cargo_quantity?: string;
}
