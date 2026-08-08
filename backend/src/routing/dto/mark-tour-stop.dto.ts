import { IsDateString, IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';
import { TourStopStatus } from '@prisma/client';

export class MarkTourStopDto {
  /** `pending` kabul edilmiyor; geri alma icin ayri uc var. */
  @IsEnum(TourStopStatus)
  status!: TourStopStatus;

  /**
   * Cevrimdisi kuyruk baglanti gelince ayni olayi tekrar gonderebilir. Istemcinin
   * urettigi bu anahtar sayesinde ikinci gonderim yeni bir kayit olusturmuyor.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  client_event_id?: string;

  /** Cevrimdisi yakalanan an. Verilmezse sunucu saati kullanilir. */
  @IsOptional()
  @IsDateString()
  occurred_at?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
