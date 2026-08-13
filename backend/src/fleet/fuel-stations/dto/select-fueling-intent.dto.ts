import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { FuelProductType } from '@prisma/client';

/** Ekranda kabul edilen litre araligi (bkz. frontend MIN/MAX_PLANNED_LITRES). */
export const MIN_PLANNED_LITRES = 1;
export const MAX_PLANNED_LITRES = 1500;

/**
 * Yakit duragi secimi.
 *
 * DIKKAT — burada ISTASYON ADI, KOORDINATI, FIYATI ve ROTA METRIGI ALANI YOK
 * ve olmamali. Olsaydi surucu (ya da eline oturum gecen biri) istedigi fiyati
 * ve istedigi istasyonu kaydedebilir, kayit sonradan yakit fisiyle
 * karsilastirildiginda denetimin dayanagi cokerdi. Bunlarin tamami
 * `selectionContextId`'nin arkasindaki sunucu snapshot'indan okunur.
 *
 * `driverId`, `vehicleId` ve `tourId` de YOK: ucu de oturumdaki surucuden ve
 * secim baglamindan cozulur. Global ValidationPipe forbidNonWhitelisted ile
 * calistigi icin bu alanlari gonderme denemesi 400 ile REDDEDILIR.
 */
export class SelectFuelingIntentDto {
  /** Arama cevabindan gelen opak kimlik. Uzunluk siniri: UUID. */
  @IsString()
  @Length(1, 64)
  selectionContextId!: string;

  /** Saglayicinin istasyon kimligi; baglam ICINDE olmak zorunda. */
  @IsString()
  @Length(1, 128)
  stationId!: string;

  @IsEnum(FuelProductType)
  selectedFuelProduct!: FuelProductType;

  /**
   * Opsiyonel. Tank kapasitesi semada YOK, bu yuzden araca ozel bir ust sinir
   * uydurulmadi — sinir yalnizca akla yatkinlik kontrolu.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_PLANNED_LITRES)
  @Max(MAX_PLANNED_LITRES)
  plannedLitres?: number;
}
