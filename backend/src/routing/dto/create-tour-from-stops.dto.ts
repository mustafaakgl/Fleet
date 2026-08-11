import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Tek bir durak. `location_id` VEYA `address` verilir; ikisi de bossa istek
 * reddedilir. Ikisi birden verilirse `location_id` esas alinir — kayitli
 * koordinat, yeniden geocode etmekten hem hizli hem guvenilir.
 */
export class TourStopInputDto {
  @IsOptional()
  @IsString()
  location_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** Durakta gecen sure; cok duraklu planda toplam surenin buyuk bolumu budur */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  service_minutes?: number;

  /** Musterinin kabul ettigi aralik, "HH:MM" — repo genelinde saatler string */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'window_start must be HH:MM' })
  window_start?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'window_end must be HH:MM' })
  window_end?: string;
}

export class CreateTourFromStopsDto {
  @IsDateString()
  work_date!: string;

  /**
   * Aracin ilk duraktan kalkis ani (ISO). Verilmezse bacak sureleri yine
   * hesaplanir ama mutlak varis saati uretilmez.
   */
  @IsOptional()
  @IsDateString()
  planned_start_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  driver_id?: string;

  /** Turun basladigi nokta. Serbest — depo olmak zorunda degil. */
  @ValidateNested()
  @Type(() => TourStopInputDto)
  start!: TourStopInputDto;

  /**
   * Aradaki duraklar. Ust sinir siralayicidan geliyor: baslangic ve bitisle
   * birlikte MAX_SEQUENCEABLE_STOPS (20) asilmamali.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => TourStopInputDto)
  stops!: TourStopInputDto[];

  /** Baslangic noktasina donulsun mu; `end` verilmisse yok sayilir */
  @IsOptional()
  @IsBoolean()
  return_to_start?: boolean;

  /** Baslangictan farkli bir bitis noktasi */
  @IsOptional()
  @ValidateNested()
  @Type(() => TourStopInputDto)
  end?: TourStopInputDto;
}
