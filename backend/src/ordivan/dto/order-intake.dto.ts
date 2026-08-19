import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * SIPARIS GELEN KUTUSU DTO'lari (Faz 16).
 *
 * ISTEMCIDEN ALINMAYAN SEYLER:
 *
 *   - `dedupeKey` / `idempotencyKey`: tekrar tespiti mesajin KENDISINDEN
 *     sunucuda turetiliyor.
 *   - `orderNumber`: bizim numaramizi disaridan belirletmek, var olan bir
 *     siparisi isaret etmesine izin vermek olurdu.
 *   - `status`, `approved`, `confirmed`: durum ve onay sonucu istekten gelmez.
 *   - `tenantId`: kiraci daima oturumdan cozulur.
 *
 * Bunlarin hicbiri asagida YOK ve olmadiklari icin reddediliyorlar.
 */

export class ListOrderIntakeQueryDto {
  /** Arayuzdeki dort sekmenin karsiligi. */
  @IsOptional()
  @IsIn(['new_order', 'amendment', 'cancellation', 'unknown'])
  intent?: string;

  @IsOptional()
  @IsIn(['extracting', 'needs_review', 'settled', 'rejected', 'failed'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class DecideOrderIntakeTaskDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  /** Insan aciklamasi. HTML olarak RENDER EDILMEZ. */
  @IsOptional()
  @IsString()
  @Length(0, 1_000)
  note?: string;
}

/**
 * Kalem govdesi — Faz 15 `ConsignmentInput`in istek karsiligi.
 *
 * KOORDINAT YOK: adres METNI aliniyor, konuma cevirme sunucunun isi.
 * `consignmentId` de YOK — insanin duzenledigi kalemler onay aninda YENIDEN
 * yaziliyor, var olan bir kalemi disaridan isaret etme yolu acilmiyor.
 */
export class OrderIntakeConsignmentDto {
  @IsString()
  @Length(1, 300)
  pickupAddress!: string;

  @IsString()
  @Length(1, 300)
  deliveryAddress!: string;

  @IsString()
  @Length(1, 500)
  cargoDescription!: string;

  @IsOptional()
  @IsISO8601()
  pickupWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  pickupWindowEnd?: string;

  @IsOptional()
  @IsISO8601()
  deliveryWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  deliveryWindowEnd?: string;

  @IsOptional()
  @Type(() => Number)
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  volumeM3?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  palletCount?: number;

  @IsOptional()
  @Type(() => Number)
  quantity?: number;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  unit?: string;

  /** `unknown` GECERLI ve GUVENLI SAYILMAZ. */
  @IsOptional()
  @IsIn(['yes', 'no', 'unknown'])
  adrStatus?: 'yes' | 'no' | 'unknown';

  @IsOptional()
  @Type(() => Number)
  temperatureMinC?: number;

  @IsOptional()
  @Type(() => Number)
  temperatureMaxC?: number;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  shipperReference?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  consigneeReference?: string;
}

export class ApproveOrderIntakeDto {
  /**
   * Insanin ONAYLADIGI niyet — ajanin onerisi degil.
   *
   * `unknown` BURADA YOK: belirsiz bir niyet onaylanamaz, once somut bir
   * niyet secilmeli.
   */
  @IsIn(['new_order', 'amendment', 'cancellation'])
  intent!: 'new_order' | 'amendment' | 'cancellation';

  /** Belirsiz eslesmede insanin sectigi musteri. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  companyId?: string;

  /** Degisiklik/iptalde insanin sectigi mevcut siparis. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  orderId?: string;

  /** Faz 15'in iyimser eszamanlilik damgasi — degisiklik icin ZORUNLU. */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /**
   * Insanin duzeltmis SON degerleri.
   *
   * Serbest bir nesne ama SONUCA giden yol dar: servis yalnizca tanidigi
   * alanlari okuyor ve Faz 15 kendi dogrulamasini ayrica yapiyor. Buradan
   * gelen bir `status` ya da `companyId` hicbir yere ULASMIYOR.
   */
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderIntakeConsignmentDto)
  consignments?: OrderIntakeConsignmentDto[];

  /** Duplicate uyarisini bilerek gecmek — kullanicinin ACIK karari. */
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicate?: boolean;
}

export class RejectOrderIntakeDto {
  /** Red sebebi ZORUNLU: sebepsiz red, neyin duzeltilecegini bilinmez kilar. */
  @IsString()
  @Length(5, 500)
  reason!: string;
}
