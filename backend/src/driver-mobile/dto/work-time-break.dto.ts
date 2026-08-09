import { IsIn, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Mola dokunusu. Butun alanlar opsiyonel cunku cevrimici bir dokunusta istemci
 * hicbir sey gondermeden de basabilmeli; alanlar cevrimdisi kuyruk icin var.
 */
export class WorkTimeBreakDto {
  /**
   * Cevrimdisi yakalanan an. Verilmezse sunucu saati kullanilir — telefon
   * cevrimdisiyken basilan mola, baglanti gelince DOGRU saatiyle yazilsin diye.
   */
  @IsOptional() @IsISO8601() occurred_at?: string;

  /**
   * Ayni dokunusun tekrar gonderiminde ikinci kayit olusmasin diye istemci
   * uretimi kimlik (bkz. TourStop isaretlemesindeki ayni desen).
   */
  @IsOptional() @IsString() @MaxLength(120) client_event_id?: string;

  @IsOptional() @IsString() @MaxLength(120) device_id?: string;

  /** Molanin hangi kaynaktan geldigi; varsayilan surucu web portali. */
  @IsOptional() @IsIn(['driver_web', 'driver_mobile']) source?: 'driver_web' | 'driver_mobile';

  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;

  @IsOptional() @IsString() assignment_id?: string;
  @IsOptional() @IsString() tour_id?: string;
}
