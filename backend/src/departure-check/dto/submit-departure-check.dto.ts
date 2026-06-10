import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DepartureCheckItemStatus } from '@prisma/client';

export class DepartureCheckItemInputDto {
  @IsString()
  @MinLength(1)
  item_key!: string;

  @IsEnum(DepartureCheckItemStatus)
  result!: DepartureCheckItemStatus;

  @IsOptional()
  @IsString()
  defect_description?: string;

  @IsOptional()
  @IsEnum(['gering', 'mittel', 'kritisch'])
  defect_severity?: 'gering' | 'mittel' | 'kritisch';
}

export class SubmitDepartureCheckDto {
  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  @IsOptional()
  @IsString()
  assignment_id?: string;

  @IsOptional()
  @IsString()
  client_submission_id?: string;

  @IsOptional()
  @IsDateString()
  offline_captured_at?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracy_m?: number;

  @IsOptional()
  @IsDateString()
  signature_confirmed_at?: string;

  @IsOptional()
  @IsString()
  signature_metadata?: string;

  @ValidateNested({ each: true })
  @Type(() => DepartureCheckItemInputDto)
  @IsArray()
  items!: DepartureCheckItemInputDto[];
}
