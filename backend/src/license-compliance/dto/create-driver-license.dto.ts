import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateDriverLicenseDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsString()
  @MinLength(1)
  license_number!: string;

  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value];
    return value;
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  classes!: string[];

  @IsDateString()
  issued_at!: string;

  @IsDateString()
  expires_at!: string;

  @IsString()
  @MinLength(1)
  issuing_authority!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
