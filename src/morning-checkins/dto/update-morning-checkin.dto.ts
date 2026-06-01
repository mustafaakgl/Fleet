import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MorningCheckinStatus } from '@prisma/client';

export class UpdateMorningCheckinDto {
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
  conflict_reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
