import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
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
import { DocumentIntakeSource, FineViolationCategory, IntakeDocumentStatus } from '@prisma/client';

/**
 * BELGE GELEN KUTUSU DTO'lari (Faz 14).
 *
 * ISTEMCININ DAYATAMADIKLARI: `tenantId`, siniflandirma sonucu, guven skoru,
 * hedef modul ve onay durumu bu siniflarin HICBIRINDE YOK. Bunlarin girdi
 * olarak kabul edilmesi, gelen kutusunu butun guard'lari atlamanin yoluna
 * cevirirdi.
 */

export class ListInboxQueryDto {
  @IsOptional()
  @IsEnum(DocumentIntakeSource)
  source?: DocumentIntakeSource;

  @IsOptional()
  @IsEnum(IntakeDocumentStatus)
  status?: IntakeDocumentStatus;

  /** Registry ile dogrulaniyor; taninmayan tur 400 doner. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  typeKey?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  assignedUserId?: string;

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

export class SegmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageFrom!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageTo!: number;

  /** Verilmezse onceki oneri korunur — bolen kisi tur belirtmek ZORUNDA DEGIL. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  typeKey?: string;
}

/** Bolme ve birlestirme AYNI ucu kullanir: gonderilen bolumleme yenisidir. */
export class ResegmentDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments!: SegmentDto[];
}

export class CorrectIntakeDocumentDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  typeKey?: string;

  /** `tuv | sp | unknown`. `null` alt turu temizler. */
  @IsOptional()
  @IsString()
  @Length(1, 20)
  subtype?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleId?: string | null;

  /** Yakit fisi icin ZORUNLU — belgeden OKUNMAZ, insan secer. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  driverId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  assignedUserId?: string | null;
}

export class RejectIntakeDocumentDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class FuelReceiptConfirmationDto {
  @IsISO8601()
  enteredAt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(100_000)
  liters!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(1_000_000)
  totalCost!: number;

  /** EUR VARSAYILMIYOR. */
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  odometerKm?: number;
}

export class VehicleDocumentConfirmationDto {
  @IsString()
  @Length(1, 120)
  documentType!: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string | null;

  /**
   * Hatirlatma varsayilan olarak OLUSMAZ. Kullanicinin acikca istemesi ve
   * tarih kontrolunun `verified` olmasi gerekir.
   */
  @IsOptional()
  @IsBoolean()
  createReminder?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  notifyBeforeDays?: number;
}

export class FineConfirmationDto {
  @IsISO8601()
  violationAt!: string;

  @IsString()
  @Length(1, 300)
  violationLocation!: string;

  @IsString()
  @Length(1, 200)
  violationType!: string;

  @IsEnum(FineViolationCategory)
  violationCategory!: FineViolationCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  paymentDueDate?: string | null;
}

/**
 * Yonlendirme govdesi.
 *
 * Hedefe gore ilgili onay nesnesi ZORUNLU olur; sunucu hangisini bekledigini
 * belgenin turunden bilir. Istemci hedefi SECEMEZ.
 */
export class RouteIntakeDocumentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => FuelReceiptConfirmationDto)
  fuelReceipt?: FuelReceiptConfirmationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleDocumentConfirmationDto)
  vehicleDocument?: VehicleDocumentConfirmationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FineConfirmationDto)
  fine?: FineConfirmationDto;
}

/**
 * Connector yuklemesi.
 *
 * `idempotencyKey` ZORUNLU: tarayici ag koptugunda ayni belgeyi yeniden
 * gonderir ve ikinci gonderim YENI GIRDI ACMAMALI.
 *
 * BURADA OLMAYANLAR: `tenantId` (guard kurar), yerel klasor yolu, bilgisayar
 * kullanici adi, cihaz seri numarasi. Tarayicinin nerede durdugu Fleet'i
 * ILGILENDIRMEZ ve toplanmasi gereksiz bir kisisel veri yuzeyi acardi.
 */
export class ConnectorIntakeUploadDto {
  @IsString()
  @Length(8, 200)
  idempotencyKey!: string;
}

/**
 * MOCK POSTA CONNECTOR'UNUN MESAJ GONDERIMI (Faz 16).
 *
 * IDEMPOTENCY ANAHTARI ISTENMIYOR ve bu bilincli fark: Faz 14'te connector
 * kendi yeniden denemesini isaretliyor, burada tekrar tespiti mesajin
 * KENDISINDEN (posta kutusu + Message-ID + icerik hash) SUNUCUDA turetiliyor.
 * Anahtari gonderene birakmak, ayni mesaji farkli anahtarlarla tekrar tekrar
 * yollayarak ikinci bir siparis actirmanin yolu olurdu.
 *
 * `mailbox` YALNIZCA bir etikettir: hangi kutuya dustugunu soyler, kiraci ya
 * da yetki BELIRLEMEZ. Kiraci daima guard'in cozdugu connector kaydindan gelir.
 */
export class ConnectorOrderIntakeMessageDto {
  @IsString()
  @Length(3, 254)
  mailbox!: string;
}
