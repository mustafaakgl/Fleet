import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AdrStatus,
  TransportOrderBillingMode,
  TransportOrderCancellationCategory,
  TransportOrderStatus,
} from '@prisma/client';

/**
 * TICARI SIPARIS DTO'lari (Faz 15).
 *
 * Global `ValidationPipe` whitelist ile calisiyor: burada tanimli OLMAYAN her
 * alan REDDEDILIR. Bu yuzden `status`, `currentRevision`, `fulfillment` ve
 * `billing` gibi TURETILMIS ya da SUNUCUNUN belirledigi alanlar bilincli
 * olarak YOK — istemci bunlari dayatamaz.
 */

export class ConsignmentDto {
  @IsString()
  @Length(1, 300)
  pickupAddress!: string;

  @IsOptional()
  @IsISO8601()
  pickupWindowStart?: string | null;

  @IsOptional()
  @IsISO8601()
  pickupWindowEnd?: string | null;

  @IsString()
  @Length(1, 300)
  deliveryAddress!: string;

  @IsOptional()
  @IsISO8601()
  deliveryWindowStart?: string | null;

  @IsOptional()
  @IsISO8601()
  deliveryWindowEnd?: string | null;

  @IsString()
  @Length(1, 500)
  cargoDescription!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  quantity?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  unit?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  weightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  volumeM3?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  palletCount?: number | null;

  /** Verilmezse `unknown`. `no` VARSAYILMAZ. */
  @IsOptional()
  @IsEnum(AdrStatus)
  adrStatus?: AdrStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-100)
  @Max(100)
  temperatureMinC?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-100)
  @Max(100)
  temperatureMaxC?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  shipperReference?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  consigneeReference?: string | null;
}

export class CreateTransportOrderDto {
  @IsString()
  @Length(1, 64)
  companyId!: string;

  @IsString()
  @Length(1, 60)
  orderNumber!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  externalReference?: string | null;

  @IsISO8601()
  orderDate!: string;

  /**
   * --- FINANSAL ALANLAR ---
   * Yalnizca finansal roller yazabilir. Yetkisiz rol gonderirse istek
   * REDDEDILIR (sessizce dusurulmez); gondermezse sunucu kiracinin
   * `baseCurrency`sini kullanir.
   */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  contractedRevenue?: number | null;

  @IsOptional()
  @IsEnum(TransportOrderBillingMode)
  billingMode?: TransportOrderBillingMode;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConsignmentDto)
  consignments?: ConsignmentDto[];

  /** Duplicate referansi bilerek gecmek — kullanicinin ACIK karari. */
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicateReference?: boolean;
}

/** Optimistic concurrency: repodaki canonical desen. */
export class ExpectedUpdatedAtDto {
  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class AmendTransportOrderDto extends ExpectedUpdatedAtDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  companyId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  externalReference?: string | null;

  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  contractedRevenue?: number | null;

  @IsOptional()
  @IsEnum(TransportOrderBillingMode)
  billingMode?: TransportOrderBillingMode;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConsignmentDto)
  consignments?: ConsignmentDto[];
}

export class RejectAmendmentDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class CancelTransportOrderDto extends ExpectedUpdatedAtDto {
  @IsEnum(TransportOrderCancellationCategory)
  category!: TransportOrderCancellationCategory;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;

  /** Etkilenen kayitlari GORDUKTEN sonra verilen acik onay. */
  @IsOptional()
  @IsBoolean()
  acknowledgeImpact?: boolean;
}

export class ListTransportOrdersQueryDto {
  @IsOptional()
  @IsEnum(TransportOrderStatus)
  status?: TransportOrderStatus;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  companyId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * Siparisten gorev taslagi.
 *
 * Gorev MEVCUT `AssignmentsService` uzerinden olusturuluyor — ikinci bir gorev
 * olusturma yolu ACILMIYOR. Bu yuzden burada yalnizca siparise OZGU alanlar
 * var; surucu/arac/tarih gibi operasyon alanlari mevcut DTO'nun kurallarina
 * tabi.
 */
export class CreateAssignmentFromOrderDto {
  @IsString()
  @Length(1, 64)
  driverId!: string;

  @IsString()
  @Length(1, 64)
  vehicleId!: string;

  @IsISO8601()
  workDate!: string;

  /** Hangi kaleme ait — bos ise siparis duzeyinde bir dilim. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  consignmentId?: string;

  /**
   * IDEMPOTENCY ICIN AYRI BIR ANAHTAR YOK ve bilincli olarak eklenmedi:
   * tekillik DOGAL ANAHTARDAN geliyor — (siparis, kalem, surucu, arac, gun).
   * Ayni dilimi ikinci kez olusturmak zaten bir tekrardir; istemcinin
   * uretecegi bir anahtar, saklamak icin yeni bir kolon isterdi ve `Assignment`
   * bu fazda YALNIZCA nullable baglanti alanlariyla genisletildi.
   */

  @IsOptional()
  @IsString()
  @Length(1, 5)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5)
  endTime?: string;

  /** FINANSAL: yalnizca finansal roller yazabilir. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  expectedDailyRevenue?: number | null;

  /**
   * MEVCUT KAPILARI ATLAMAZ, ILETIR.
   *
   * `AssignmentsService.create` ehliyet uygunlugu ve arac arizasi icin ACIK
   * onay istiyor. Siparis yolunun bu onaylari GONDEREBILMESI gerekir; aksi
   * halde siparisten hicbir gorev acilamazdi. Onaylari BURADA yok saymak ise
   * kapiyi atlamak olurdu — bayrak kullanicidan gelir, sunucudan degil.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeLicenseComplianceWarning?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeVehicleDefectWarning?: boolean;
}

/** Eski bir gorevi siparise baglama. */
export class LinkAssignmentDto {
  @IsString()
  @Length(1, 64)
  assignmentId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  consignmentId?: string;
}
