import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { FuelEntryWorkflowStatus, FuelProductType } from '@prisma/client';

/** Ret nedeni surucuye GOSTERILIYOR: bos ya da tek harf olamaz. */
export const MIN_REJECTION_REASON = 5;
export const MAX_REJECTION_REASON = 500;
export const MAX_ACCOUNTING_NOTE = 500;

/**
 * Onay istegi.
 *
 * MALI ALAN YOK ve olmamali: muhasebe surucunun dogruladigi tutarlari
 * SESSIZCE degistiremez. Bir sey yanlissa reddedip surucuye duzelttirir —
 * aksi halde "surucu neyi onayladi" sorusunun cevabi kaybolur ve fis
 * goruntusuyle kayit birbirini tutmayabilir.
 */
export class ApproveFuelReceiptDto {
  /**
   * Optimistic concurrency: istemcinin GORDUGU son guncelleme ani.
   *
   * Repoda hazir bir surum alani yok; `updatedAt` bu isi goruyor cunku her
   * yazmada degisiyor. Sunucu bunu kosullu bir guncellemede kullaniyor, yani
   * iki muhasebecinin ayni fisi ayni anda kapatmasi imkansiz.
   */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, MAX_ACCOUNTING_NOTE)
  accountingNote?: string;
}

/** Ret istegi. Neden ZORUNLU — surucu neyi duzeltecegini bilmeli. */
export class RejectFuelReceiptDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsString()
  @Length(MIN_REJECTION_REASON, MAX_REJECTION_REASON)
  reason!: string;
}

/** Muhasebe kuyrugu filtreleri. */
export class ListFuelReceiptsQueryDto {
  @IsOptional()
  @IsEnum(FuelEntryWorkflowStatus)
  status?: FuelEntryWorkflowStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  driverId?: string;

  @IsOptional()
  @IsEnum(FuelProductType)
  fuelProduct?: FuelProductType;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  station?: string;

  /** Yalnizca supheli duplicate isaretli kayitlar. */
  @IsOptional()
  @IsString()
  @Length(1, 5)
  duplicateOnly?: string;

  /** Yalnizca yakit uyumsuzlugu isaretli kayitlar. */
  @IsOptional()
  @IsString()
  @Length(1, 5)
  mismatchOnly?: string;

  /** OCR basarisiz ya da dusuk guvenli kayitlar. */
  @IsOptional()
  @IsString()
  @Length(1, 5)
  ocrProblemOnly?: string;

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

  /**
   * Siralama. Varsayilan `oldest`: muhasebe kuyrugunda en uzun bekleyen once
   * gelmeli, aksi halde eski fisler listenin dibinde unutulur.
   */
  @IsOptional()
  @IsEnum(['oldest', 'newest', 'amount'] as unknown as object)
  sort?: 'oldest' | 'newest' | 'amount';
}
