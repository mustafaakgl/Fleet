import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { FuelEntryReversalReason, FuelProductType } from '@prisma/client';
import {
  MAX_RECEIPT_AMOUNT,
  MAX_RECEIPT_LITERS,
  MIN_RECEIPT_LITERS,
} from '../core/fuel-receipt-validation.util';

/**
 * Aciklama uzunlugu.
 *
 * ALT SINIR VAR cunku bu metin aylar sonra denetimde okunacak tek insan
 * ifadesi; "x" ya da "hata" yazilmis bir ters kayit, hicbir sey yazilmamis
 * kadar degersizdir. UST SINIR VAR cunku alan bir not defteri degil.
 */
export const MIN_REVERSAL_REASON = 10;
export const MAX_REVERSAL_REASON = 500;

/** Bastaki/sondaki bosluk temizlenir; SADECE bosluktan olusan metin bos sayilir. */
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Ters kayit istegi.
 *
 * MALI ALAN YOK: ters kayit tutar TASIMAZ. Gecerlilik orijinal kaydin
 * kendisinden okunuyor; istemcinin gonderdigi bir tutara guvenmek, geri
 * alinan miktarin gercek kayitla tutmamasi demek olurdu.
 */
export class ReverseFuelReceiptDto {
  /**
   * Optimistic concurrency — Faz 7'deki AYNI desen.
   *
   * Yeni bir surum sistemi kurulmadi: `updatedAt` her yazmada degisiyor ve
   * kosullu guncellemede surum alani gorevi goruyor.
   */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsEnum(FuelEntryReversalReason)
  reasonCode!: FuelEntryReversalReason;

  @Transform(trimmed)
  @IsString()
  @Length(MIN_REVERSAL_REASON, MAX_REVERSAL_REASON)
  reason!: string;

  /** Duzeltilmis kopya olusturulsun mu. Varsayilan: HAYIR. */
  @IsOptional()
  @IsBoolean()
  createReplacement?: boolean;
}

/**
 * Duzeltme kaydinin duzenlenmesi.
 *
 * ALAN LISTESI, surucunun `ConfirmFuelReceiptDto`sundan TURETILDI: muhasebe
 * duzeltirken de aynı sey duzeltilebilmeli. Burada da `vehicleId`,
 * `driverId`, `tenantId`, `workflowStatus`, `receiptStoredPath` ve
 * `fuelingIntentId` YOK:
 *   * araci/surucuyu degistirmek yeni bir kayit demektir, duzeltme degil;
 *   * is akisi durumunu istemci secemez — aksi halde muhasebe kendi
 *     duzeltmesini tek istekle `approved` yapip incelemeyi atlardi;
 *   * dosya yolu istemciye hic gosterilmiyor ki degistirilebilsin.
 *
 * Global ValidationPipe `forbidNonWhitelisted` ile calistigi icin bu
 * alanlari gonderme denemesi 400 ile REDDEDILIR.
 */
export class UpdateFuelReceiptCorrectionDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 200)
  stationName?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 300)
  stationAddress?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 80)
  receiptNumber?: string;

  @IsISO8601()
  purchasedAt!: string;

  @IsEnum(FuelProductType)
  fuelProduct!: FuelProductType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(MIN_RECEIPT_LITERS)
  @Max(MAX_RECEIPT_LITERS)
  liters!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  pricePerLiter?: number;

  /** YAKIT satirinin brut toplami — araca yazilacak tutar. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  fuelGrossAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  receiptGrossAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  receiptNetAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  receiptVatAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  receiptVatRate?: number;

  @Transform(trimmed)
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 60)
  paymentMethod?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(9_999_999)
  odometerKm?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 20)
  receiptPlateNumber?: string;

  @IsOptional()
  @IsBoolean()
  isFullTank?: boolean;
}
