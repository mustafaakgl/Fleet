import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleStatus } from '@prisma/client';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  plate_number?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsString()
  internal_code?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsString()
  current_driver_id?: string;

  @IsOptional()
  @IsDateString()
  tuv_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  sp_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  insurance_expiry_date?: string;

  @IsOptional()
  @IsDateString()
  registration_expiry_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  /**
   * Toplam KULLANILABILIR depo hacmi (litre). Cift depolu cekicide iki
   * deponun TOPLAMI — telematik yuzdesi tek bir seviye olarak geliyor ve
   * yuzde -> litre cevrimi ancak toplam kapasiteyle anlamli (Faz 11).
   *
   * Bos birakilabilir: bilinmeyen kapasiteye tahmin yazmak, yakit
   * mutabakatinda olculmus gibi gorunen uydurma bir litre farki uretirdi.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(5000)
  fuel_tank_capacity_liters?: number;
}
