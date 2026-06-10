import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { FineViolationCategory } from '@prisma/client';

export class CreateFineDto {
  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  @IsDateString()
  violation_at!: string;

  @IsString()
  @MinLength(1)
  violation_location!: string;

  @IsString()
  @MinLength(1)
  violation_type!: string;

  @IsEnum(FineViolationCategory)
  violation_category!: FineViolationCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  payment_due_date?: string;

  @IsOptional()
  @IsDateString()
  notice_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  driver_id?: string;

  @IsOptional()
  @IsString()
  matched_work_session_id?: string;

  @IsOptional()
  @IsString()
  matched_assignment_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerance_minutes?: number;
}
