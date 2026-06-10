import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DefectStatus } from '@prisma/client';

export class UpdateDefectStatusDto {
  @IsEnum(DefectStatus)
  status!: DefectStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  repair_company?: string;

  @IsOptional()
  @IsDateString()
  estimated_repair_date?: string;

  @IsOptional()
  @IsString()
  service_record_id?: string;

  @IsOptional()
  @IsString()
  confirmation_driver_id?: string;
}
