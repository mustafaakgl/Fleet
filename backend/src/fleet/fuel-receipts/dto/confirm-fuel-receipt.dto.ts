import { Type } from 'class-transformer';
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
import { FuelProductType } from '@prisma/client';
import {
  MAX_RECEIPT_AMOUNT,
  MAX_RECEIPT_LITERS,
  MIN_RECEIPT_LITERS,
} from '../core/fuel-receipt-validation.util';

/**
 * Surucunun fisi DOGRULADIGI istek.
 *
 * DIKKAT — burada `driverId`, `vehicleId`, `tenantId`, `workflowStatus`,
 * `ocrStatus`, `receiptStoredPath` ve `fuelingIntentId` ALANI YOK ve olmamali:
 *   * sahiplik sunucuda oturumdan cozulur,
 *   * is akisi durumunu istemci secemez (aksi halde kendi fisini `approved`
 *     yapip dogrudan maliyete yazardi),
 *   * dosya yolu istemciye hic gosterilmiyor ki degistirilebilsin,
 *   * yakit niyeti bagi YUKLEME aninda kuruluyor, confirm'de degistirilemiyor.
 *
 * Global ValidationPipe `forbidNonWhitelisted` ile calistigi icin bu alanlari
 * gonderme denemesi 400 ile REDDEDILIR.
 */
export class ConfirmFuelReceiptDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  stationName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  stationAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  receiptNumber?: string;

  /** Fisteki yakit alma ani. Gelecege dogru makul olmayan tarih reddedilir. */
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

  /** YAKIT satirinin brut toplami — araca yazilan maliyet. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_RECEIPT_AMOUNT)
  fuelGrossAmount!: number;

  /**
   * Fisin GENEL brut toplami. Karma fiste yakit toplamindan buyuktur;
   * verilmezse yakit toplami ile ayni sayilir.
   */
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

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
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
  @IsString()
  @Length(1, 20)
  receiptPlateNumber?: string;

  @IsOptional()
  @IsBoolean()
  isFullTank?: boolean;

  /**
   * "Yakit turunun fiste dogru oldugunu onayliyorum."
   *
   * Yalnizca fisteki urun aracin ONAYLI listesinde degilken gerekli. Kayit yok
   * edilmiyor: surucu acikca onayliyor, kayit isaretleniyor ve muhasebe
   * incelemesine gidiyor.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeFuelMismatch?: boolean;
}
