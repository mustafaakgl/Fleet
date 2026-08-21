import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { DeliverySlotInvitationStatus, DeliverySlotStatus } from '@prisma/client';

/**
 * SLOT DTO'lari (Faz 17f).
 *
 * ISTEMCININ DAYATAMADIKLARI — hicbiri bu siniflarda YOK, dolayisiyla
 * gonderilirse istek 400 ile duser:
 *
 *   - `tenantId` — public uclarda kiraci TOKEN'DAN, ic uclarda auth
 *     baglamindan cozuluyor.
 *   - `token`, `tokenHash`, `tokenPrefix` — token sunucuda uretilir ve
 *     YALNIZCA uretildigi anda bir kez doner.
 *   - `sourceRevision` — davetin dayandigi revizyon siparisten OKUNUR.
 *     Istemci yazabilseydi bayat bir daveti "guncel" ilan edebilirdi.
 *   - `status`, `bookedCount` (rezervasyonda) — kapasite VERITABANINDA
 *     kosullu update ile korunuyor; istemcinin bildirdigi sayaca guvenmek o
 *     korumayi anlamsiz kilardi.
 *   - `timezone` — konumdan, o yoksa kiracidan cozuluyor. Sabit varsayilan YOK
 *     ve istemci secemez: yanlis bir dilim pencereyi saatlerce kaydirirdi.
 */

export class CreateSlotInvitationDto {
  @IsString()
  @Length(1, 64)
  consignmentId!: string;

  @IsIn(['pickup', 'delivery'])
  kind!: 'pickup' | 'delivery';

  /**
   * Gecerlilik suresi (saat).
   *
   * UST SINIR 30 GUN: suresiz ya da cok uzun bir link, sizdiginda o kadar
   * sure gecerli kalir. Alt sinir 1 saat — daha kisasi mesru musteriye
   * ulasmadan olurdu.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}

export class ReissueSlotInvitationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}

export class ListSlotInvitationsQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  consignmentId?: string;

  @IsOptional()
  @IsEnum(DeliverySlotInvitationStatus)
  status?: DeliverySlotInvitationStatus;

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

export class ListManagedSlotsQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  locationId?: string;

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

export class CreateSlotDto {
  @IsString()
  @Length(1, 64)
  locationId!: string;

  /** UTC ANI. `timezone` sunucuda cozuluyor ve YALNIZCA gosterim icin. */
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  /**
   * Kontenjan.
   *
   * SIFIR KABUL EDILMIYOR: kapasitesi sifir olan bir slot "kapali" demektir
   * ve bunun kendi alani var (`status`). Iki farkli yolla ayni seyi ifade
   * etmek, birini kontrol edip digerini unutmaya davetiye cikarirdi.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  /** Rampa/kapi. NULL DEGIL BOS METIN — tekillik anahtarinin parcasi. */
  @IsOptional()
  @IsString()
  @Length(0, 80)
  resourceRef?: string;
}

export class UpdateSlotDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsEnum(DeliverySlotStatus)
  status?: DeliverySlotStatus;
}

/**
 * Oturum acma (Faz 17g).
 *
 * Token GOVDEDE ya da BASLIKTA — ikisi de URL'DE DEGIL. Tarayici akisinda
 * govde kullaniliyor cunku sayfa token'i fragment'tan okuyup tek bir POST ile
 * gonderiyor; `?token=` olsaydi deger vekil loglarina ve `Referer` basligina
 * duserdi.
 */
export class OpenSlotSessionDto {
  /**
   * UZUNLUK KISITI BILINCLI OLARAK GENIS.
   *
   * `@Length(20, 128)` yazsaydik KISA bir token 400, gecerli uzunlukta ama
   * taninmayan bir token 404 donerdi — yani cevabin KENDISI token'in bicimi
   * hakkinda bilgi verirdi. Butun basarisiz sonuclarin ayirt edilemez olmasi
   * bu ucun temel kurali; bicim dogrulamasi da serviste AYNI guvenli 404'e
   * dusuyor. Ust sinir yalnizca govdeyi sinirlamak icin.
   */
  @IsOptional()
  @IsString()
  @Length(1, 512)
  token?: string;
}

/** Public rezervasyon. Token GOVDEDE DEGIL, baslikta ya da oturumda. */
export class BookSlotDto {
  @IsString()
  @Length(1, 64)
  slotId!: string;
}
