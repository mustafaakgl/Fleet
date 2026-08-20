import {
  IsBoolean,
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
  ValidateIf,
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

  // --- FAZ 17: YUK KAPASITESI VE ADR ---
  //
  // HEPSI OPSIYONEL VE BOS GONDERIM ALANI TEMIZLER. Bir varsayilan yazsaydik
  // dispatch motoru "bilmiyorum" diyemez, eksik veriyi kesin cevap gibi
  // sunardi. Bos birakilan alan, motorda `unknown` uretir ve plan uygulamayi
  // ENGELLER — dogru davranis bu.

  /** Tasiyabilecegi yuk (kg). Aracin toplam agirligi DEGIL. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  payload_capacity_kg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1_000)
  cargo_volume_m3?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  pallet_capacity?: number;

  /**
   * ADR tasima yetkisi — UC DURUMLU.
   *
   * `true`/`false` ACIK bir cevap; alani hic gondermemek mevcut degeri KORUR;
   * `null` gondermek BILINMIYOR'a geri doner. Ucuncu durumu kaldirmak,
   * belgesi girilmemis araci ya yanlis sekilde eler ya da daha kotusu
   * tehlikeli maddeyi yetkisiz araca yukletirdi.
   */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsBoolean()
  adr_certified?: boolean | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(500)
  height_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(3_000)
  length_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(400)
  width_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000)
  gross_weight_kg?: number;
}
