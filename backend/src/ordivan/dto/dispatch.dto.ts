import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DispatchProposalGeneration, DispatchProposalStatus } from '@prisma/client';

/**
 * DISPATCH DTO'lari (Faz 17f).
 *
 * BU SINIFLARDA OLMAYAN SEY, SOZLESMENIN KENDISIDIR. Global
 * `ValidationPipe` `whitelist` + `forbidNonWhitelisted` ile calisiyor: burada
 * TANIMLI OLMAYAN her alan istegi 400 ile dusurur. Dolayisiyla asagidakilerin
 * YOKLUGU bir eksiklik degil, bilincli bir kapidir:
 *
 *   - `tenantId` — kiraci auth baglamindan cozuluyor. Istemciden alinsaydi
 *     butun kiraci sinirini istemcinin kendisi belirlerdi.
 *   - `confidence`, `evidence`, `payload` — ajanin ciktisi. Istemci
 *     yazabilseydi "model bunu %99 guvenle onerdi" diye bir sey uydurulabilir
 *     ve insan incelemesi o uydurmaya dayanirdi.
 *   - Finansal tutarlar — plan fiyat belirlemez. Bir tutar buradan
 *     gelebilseydi, gelir alani onay ekranindan sessizce degistirilirdi.
 *   - `resultTourId` — sonuc SUNUCUDA olusur ve `@unique` ile bir kez baglanir.
 *     Istemci verebilseydi, var olan bir tur baska bir oneriye baglanabilirdi.
 *   - Uygunluk sonucu (`checks`, `overallStatus`, `decision`, `applicable`) —
 *     uygunluk SUNUCUDA, deterministik kurallarla belirlenir. Istemcinin
 *     "bu aday uygun" demesi, bakimdaki bir araci yola cikarirdi.
 *   - Ajan adina onay (`actorKind`, `agentRunId`, `onBehalfOf`) — onayi bir
 *     INSAN verir; connector'in kullanici API'sinde isi yoktur.
 *   - Worker/job durumu (`generation`, `jobStatus`, `jobAttempt` yazma olarak)
 *     — is durumu yalnizca scoped connector protokolunden guncellenir.
 */

export class CreateDispatchProposalDto {
  /**
   * Planlanacak siparisler.
   *
   * UST SINIR VAR: bir turda konsolide edilebilecek siparis sayisi
   * `dispatch.plan` sozlesmesinde 20 ile sinirli. Sinirsiz birakmak, tek
   * istekle butun filoyu tarayan bir sorgu ureten bir kapi olurdu.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  transportOrderIds!: string[];

  /** Plan gunu — `YYYY-MM-DD`. Saat dilimi TASIMAZ. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: 'workDate must be YYYY-MM-DD' })
  workDate!: string;
}

export class ListDispatchProposalsQueryDto {
  @IsOptional()
  @IsEnum(DispatchProposalStatus)
  status?: DispatchProposalStatus;

  @IsOptional()
  @IsEnum(DispatchProposalGeneration)
  generation?: DispatchProposalGeneration;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  workDateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  workDateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** UST SINIR ZORUNLU: sayfalamasiz bir liste ucu bir DoS yuzeyidir. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/**
 * BEYANIN KAPSAMI — ISTEMCI TARAFINDAN TEKRARLANIR, SUNUCU TARAFINDAN
 * DOGRULANIR.
 *
 * Bes parcanin BESI de sunucunun kendi hesabiyla eslesmezse beyan gecersiz
 * sayilir (bkz. `scopeMatches`). Bu alanlarin istemciden gelmesi bir acik
 * degil, tam tersi: beyan veren kisinin NEYI ustlendigini acikca yazmasini
 * zorunlu kiliyor. Kapsami sunucu doldursaydi, "neyi onayladigimi
 * bilmiyordum" savunmasi hakli olurdu.
 */
export class OverrideScopeDto {
  @IsString()
  @Length(1, 64)
  dispatchProposalId!: string;

  @IsString()
  @Length(1, 64)
  vehicleId!: string;

  @IsString()
  @Length(1, 64)
  driverId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  workDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  proposalRevision!: number;
}

export class OverrideDeclarationDto {
  /** Asilacak kontrolun kodu. `incompatible` bir kontrol ASILAMAZ. */
  @IsString()
  @Length(1, 80)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  /** ACIK SECIM: "bilmiyorum" bir cevap DEGIL, o yuzden ucuncu deger yok. */
  @IsOptional()
  @IsIn(['yes', 'no'])
  answer?: 'yes' | 'no';

  @ValidateNested()
  @Type(() => OverrideScopeDto)
  scope!: OverrideScopeDto;
}

/**
 * ONAY.
 *
 * UC ZORUNLU KORUMA — hicbiri istege bagli degil:
 *
 *   - `expectedUpdatedAt`: iyimser eszamanlilik damgasi. Iki dispatcher ayni
 *     oneriyi ayni anda onaylarsa biri 409 alir; damgasiz olsaydi ikisi de
 *     "onayladim" sanirdi.
 *   - `proposalRevision`: onerinin hangi HESABINA bakarak onayladigi. Oneri
 *     bu arada yeniden uretildiyse ekrandaki adaylar artik gecerli degildir.
 *   - `idempotencyKey`: ag tekrari ya da cift tiklama IKINCI BIR TUR
 *     URETMEZ. `resultTourId @unique` zaten ikinci turu engelliyor; anahtar
 *     istemciye "ayni istegi mi tekrarladim, yoksa baskasi mi onayladi"
 *     sorusunun cevabini veriyor.
 */
export class ApproveDispatchDto {
  @IsString()
  @Length(1, 64)
  vehicleId!: string;

  @IsString()
  @Length(1, 64)
  driverId!: string;

  @IsISO8601()
  expectedUpdatedAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  proposalRevision!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OverrideDeclarationDto)
  overrides?: OverrideDeclarationDto[];
}

/** Red de bir KARARDIR: ayni eszamanlilik ve tekrar korumasini tasir. */
export class RejectDispatchDto {
  /** SEBEPSIZ RED, neyin duzeltilecegini bilinmez kilar. */
  @IsString()
  @Length(5, 500)
  reason!: string;

  @IsISO8601()
  expectedUpdatedAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  proposalRevision!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
