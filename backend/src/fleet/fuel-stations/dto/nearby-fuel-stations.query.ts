import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Yaricap sinirlari. Ust sinir saglayici sozlesmesinin izin verdigi en fazla. */
export const MIN_FUEL_STATION_RADIUS_KM = 1;
export const MAX_FUEL_STATION_RADIUS_KM = 25;
export const DEFAULT_FUEL_STATION_RADIUS_KM = 10;

/**
 * Surucunun yakin istasyon sorgusu.
 *
 * DIKKAT — burada vehicleId ALANI YOK ve olmamali: arac sunucuda cozuluyor.
 * Alan eklenirse surucu baska bir aracin yakit profiliyle arama yapabilir ve
 * uyumluluk filtresi anlamsizlasir.
 *
 * Sinirlar: 1 km altinda arama pratikte tek istasyon dondurur ve her kucuk
 * hareket yeni istek uretir; 25 km ustu Tankerkonig tarafindan reddedilir.
 */
export class NearbyFuelStationsQueryDto {
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_FUEL_STATION_RADIUS_KM)
  @Max(MAX_FUEL_STATION_RADIUS_KM)
  radius_km?: number;
}
