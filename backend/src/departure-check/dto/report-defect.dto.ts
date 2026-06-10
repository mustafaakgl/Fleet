import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DefectSeverity } from '@prisma/client';

export class ReportDefectDto {
  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(DefectSeverity)
  severity!: DefectSeverity;

  @IsOptional()
  @IsString()
  title?: string;
}
