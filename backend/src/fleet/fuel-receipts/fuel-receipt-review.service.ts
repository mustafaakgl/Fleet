import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FuelEntryWorkflowStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { DriverNotifyService } from '../../notifications/driver-notify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FuelReconciliationReviewService } from '../fuel-reconciliation/fuel-reconciliation-review.service';
import { FuelReconciliationService } from '../fuel-reconciliation/fuel-reconciliation.service';
import type {
  ApproveFuelReceiptDto,
  ListFuelReceiptsQueryDto,
  RejectFuelReceiptDto,
} from './dto/review-fuel-receipt.dto';
import {
  amountsMatch,
  isMixedReceipt,
  validateFuelReceiptDraft,
  type FuelReceiptIssue,
} from './core/fuel-receipt-validation.util';
import {
  effectiveAccountingStatus,
  type EffectiveAccountingStatus,
} from './core/effective-fuel-cost';
import { LOW_OCR_CONFIDENCE, lowConfidenceFields } from './core/ocr-confidence.util';
import type { NormalizedFuelReceiptExtraction } from './fuel-receipt-ocr.types';

const DEFAULT_PAGE_SIZE = 25;

/** Kuyruk satiri — LISTE icin gereken en az alan. */
export interface ReviewQueueRow {
  id: string;
  workflowStatus: FuelEntryWorkflowStatus;
  vehicle: { id: string; plateNumber: string };
  driver: { id: string; name: string };
  stationName: string | null;
  purchasedAt: string;
  fuelProduct: string | null;
  liters: number | null;
  /** YAKIT satirinin brut toplami — araca yazilacak tutar. */
  fuelGrossAmount: number | null;
  currency: string;
  submittedAt: string | null;
  /** Kac gundur bekliyor — kuyrugun asil sinyali. */
  waitingDays: number | null;
  compatibilityMismatch: boolean;
  duplicateSuspected: boolean;
  ocrProblem: boolean;
  /**
   * Muhasebe acisindan ETKILI durum. Liste ve detay AYNI turetmeden geciyor;
   * bir ekranda "onayli", digerinde "ters kayit" gorunmesi mumkun degil.
   */
  effectiveAccountingStatus: EffectiveAccountingStatus;
  /** Bu satir bir ters kaydin duzeltilmis kopyasi mi. */
  isCorrection: boolean;
  updatedAt: string;
}

export interface ReviewQueueResponse {
  rows: ReviewQueueRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Kuyrugun ozeti — ekranin ustundeki iki rakam. */
  summary: { pendingCount: number; oldestWaitingDays: number | null };
}

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function daysBetween(from: Date | null, to: Date): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

const QUEUE_SELECT = {
  id: true,
  workflowStatus: true,
  stationName: true,
  enteredAt: true,
  fuelProduct: true,
  liters: true,
  totalCost: true,
  currency: true,
  submittedAt: true,
  compatibilityMismatch: true,
  receiptFileHash: true,
  ocrStatus: true,
  ocrExtraction: true,
  updatedAt: true,
  vehicle: { select: { id: true, plateNumber: true } },
  driver: { select: { id: true, firstName: true, lastName: true } },
  // Ters kayit iliskisi HER sorguda geliyor: etkili durumu ikinci bir
  // sorguyla cozmek, kuyruk buyudukce satir basina bir istek (N+1) demekti.
  reversal: { select: { id: true } },
  correctionOf: { select: { id: true } },
} satisfies Prisma.FleetFuelEntrySelect;

/**
 * Muhasebenin yakit fisi incelemesi.
 *
 * ONAY YENI BIR MALIYET SATIRI URETMEZ. Maliyet sorgusu zaten
 * `workflowStatus = 'approved'` satirlarini topluyor (bkz.
 * FleetFuelService.buildListWhere ve DashboardService.getVehicleCosts);
 * onay yalnizca durumu degistirir. Ikinci bir gider tablosu ayni gercegi iki
 * yerde tutar ve raporlarin hangisini saydigini belirsiz birakirdi.
 *
 * MUHASEBE SURUCUNUN TUTARLARINI DEGISTIREMEZ. Bir sey yanlissa reddedip
 * surucuye duzelttirir; aksi halde "surucu neyi onayladi" sorusunun cevabi
 * kaybolur ve fis goruntusuyle kayit birbirini tutmayabilir.
 */
@Injectable()
export class FuelReceiptReviewService {
  private readonly logger = new Logger(FuelReceiptReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly driverNotify: DriverNotifyService,
    private readonly reconciliation: FuelReconciliationService,
    private readonly reconciliationReview: FuelReconciliationReviewService,
  ) {}

  private isTrue(raw: string | undefined): boolean {
    return raw === 'true' || raw === '1';
  }

  async list(query: ListFuelReceiptsQueryDto): Promise<ReviewQueueResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);

    const where: Prisma.FleetFuelEntryWhereInput = {
      // Yalnizca FIS AKISINDAN dogmus kayitlar: ofis/surucu dogrudan giris
      // uclarindan gelen eski kayitlarin incelenecek bir goruntusu yok.
      receiptStoredPath: { not: null },
      // Varsayilan kuyruk: yalnizca `submitted`.
      workflowStatus: query.status ?? FuelEntryWorkflowStatus.submitted,
    };

    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.driverId) where.driverId = query.driverId;
    if (query.fuelProduct) where.fuelProduct = query.fuelProduct;
    if (query.station) {
      where.stationName = { contains: query.station, mode: 'insensitive' };
    }
    if (query.from || query.to) {
      const enteredAt: Prisma.DateTimeFilter = {};
      if (query.from) enteredAt.gte = new Date(query.from);
      if (query.to) enteredAt.lte = new Date(query.to);
      where.enteredAt = enteredAt;
    }
    if (this.isTrue(query.mismatchOnly)) {
      where.compatibilityMismatch = true;
    }
    if (this.isTrue(query.ocrProblemOnly)) {
      where.ocrStatus = { in: ['failed', 'not_requested'] };
    }

    const orderBy: Prisma.FleetFuelEntryOrderByWithRelationInput[] =
      query.sort === 'newest'
        ? [{ submittedAt: 'desc' }, { id: 'asc' }]
        : query.sort === 'amount'
          ? [{ totalCost: 'desc' }, { id: 'asc' }]
          : // Varsayilan: EN UZUN BEKLEYEN once. Kararli `id` tie-break olmadan
            // ayni saniyede gonderilmis iki fis sayfalar arasinda yer degistirir
            // ve biri hic gorunmeyebilir.
            [{ submittedAt: 'asc' }, { id: 'asc' }];

    const now = new Date();
    const [total, rows, pendingCount, oldestPending] = await Promise.all([
      this.prisma.fleetFuelEntry.count({ where }),
      this.prisma.fleetFuelEntry.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: QUEUE_SELECT,
      }),
      this.prisma.fleetFuelEntry.count({
        where: {
          receiptStoredPath: { not: null },
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
      }),
      this.prisma.fleetFuelEntry.findFirst({
        where: {
          receiptStoredPath: { not: null },
          workflowStatus: FuelEntryWorkflowStatus.submitted,
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        select: { submittedAt: true },
      }),
    ]);

    const duplicates = await this.duplicateSuspectIds(rows);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        workflowStatus: row.workflowStatus,
        vehicle: { id: row.vehicle.id, plateNumber: row.vehicle.plateNumber },
        driver: {
          id: row.driver.id,
          name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
        },
        stationName: row.stationName,
        purchasedAt: row.enteredAt.toISOString(),
        fuelProduct: row.fuelProduct,
        liters: num(row.liters),
        fuelGrossAmount: num(row.totalCost),
        currency: row.currency,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        waitingDays: daysBetween(row.submittedAt, now),
        compatibilityMismatch: row.compatibilityMismatch,
        duplicateSuspected: duplicates.has(row.id),
        ocrProblem: this.hasOcrProblem(row),
        effectiveAccountingStatus: effectiveAccountingStatus(
          row.workflowStatus,
          // `!= null`: iliski secilmemisse `undefined` gelir ve `!== null`
          // o durumda yanlislikla "ters kayit var" derdi.
          row.reversal != null,
        ),
        isCorrection: row.correctionOf != null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        pendingCount,
        oldestWaitingDays: daysBetween(oldestPending?.submittedAt ?? null, now),
      },
    };
  }

  /** OCR hic calismadi, basarisiz oldu ya da dusuk guvenli alan birakti. */
  private hasOcrProblem(row: {
    ocrStatus: string;
    ocrExtraction: Prisma.JsonValue | null;
  }): boolean {
    if (row.ocrStatus === 'failed' || row.ocrStatus === 'not_requested') {
      return true;
    }
    const extraction = row.ocrExtraction as NormalizedFuelReceiptExtraction | null;
    return lowConfidenceFields(extraction).length > 0;
  }

  /**
   * Supheli duplicate kimlikleri.
   *
   * Ayni arac + ayni gun + ayni tutar. Tek sorgu, listedeki araclarla sinirli:
   * her satir icin ayri sorgu atmak kuyruk buyudukce N+1 uretirdi.
   */
  private async duplicateSuspectIds(
    rows: Array<{
      id: string;
      enteredAt: Date;
      totalCost: Prisma.Decimal | null;
      vehicle: { id: string };
    }>,
  ): Promise<Set<string>> {
    const withAmount = rows.filter((row) => row.totalCost !== null);
    if (withAmount.length === 0) {
      return new Set();
    }

    const candidates = await this.prisma.fleetFuelEntry.findMany({
      where: {
        vehicleId: { in: [...new Set(withAmount.map((row) => row.vehicle.id))] },
        workflowStatus: {
          in: [
            FuelEntryWorkflowStatus.submitted,
            FuelEntryWorkflowStatus.approved,
          ],
        },
      },
      select: { id: true, vehicleId: true, enteredAt: true, totalCost: true },
    });

    const suspects = new Set<string>();
    for (const row of withAmount) {
      const amount = Number(row.totalCost);
      const day = row.enteredAt.toISOString().slice(0, 10);
      const twin = candidates.find(
        (other) =>
          other.id !== row.id &&
          other.vehicleId === row.vehicle.id &&
          other.enteredAt.toISOString().slice(0, 10) === day &&
          other.totalCost !== null &&
          amountsMatch(Number(other.totalCost), amount),
      );
      if (twin) {
        suspects.add(row.id);
      }
    }
    return suspects;
  }

  /** Kaydi kiraci kapsaminda bulur; yoksa 404 (varligi sizdirilmaz). */
  private async requireReceipt(receiptId: string) {
    const row = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, receiptStoredPath: { not: null } },
      select: {
        ...QUEUE_SELECT,
        stationAddress: true,
        receiptNumber: true,
        pricePerLiter: true,
        receiptGrossAmount: true,
        receiptNetAmount: true,
        receiptVatAmount: true,
        receiptVatRate: true,
        paymentMethod: true,
        odometerKm: true,
        receiptPlateNumber: true,
        isFullTank: true,
        receiptMimeType: true,
        receiptOriginalName: true,
        // Duzeltilmis kopya AYNI dosyayi paylasiyor; fiziksel ikinci kopya
        // uretilmiyor (bkz. FuelReceiptReversalService.buildReplacementData).
        receiptStoredPath: true,
        ocrProvider: true,
        ocrProcessedAt: true,
        ocrErrorClass: true,
        ocrDataMode: true,
        createdAt: true,
        reviewedAt: true,
        accountingNote: true,
        rejectionReason: true,
        rejectedAt: true,
        resubmittedAt: true,
        fuelingIntentId: true,
        reviewedBy: { select: { id: true, fullName: true } },
        // Ters kayit ve duzeltme zinciri. Aktor icin mevcut GUVENLI kullanici
        // ozeti deseni kullaniliyor: e-posta, telefon, rol gibi alanlar
        // response'a hic girmiyor.
        reversal: {
          select: {
            id: true,
            reasonCode: true,
            reason: true,
            reversedAt: true,
            replacementEntryId: true,
            reversedBy: { select: { id: true, fullName: true } },
          },
        },
        correctionOf: {
          select: { id: true, originalEntryId: true, reversedAt: true },
        },
        fuelingIntent: {
          select: {
            id: true,
            stationName: true,
            selectedFuelProduct: true,
            quotedPricePerLitre: true,
            selectedAt: true,
            status: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return row;
  }

  async detail(receiptId: string) {
    const row = await this.requireReceipt(receiptId);
    const extraction = row.ocrExtraction as NormalizedFuelReceiptExtraction | null;
    const duplicates = await this.duplicateSuspectIds([row]);
    // Telematik mutabakati (Faz 11) — AYNI istekte geliyor: cekmece zaten bu
    // detayi cekiyor ve ikinci bir tur, panelin fis bilgisinden daha gec
    // gelmesine yol acardi.
    const reconciliation = await this.reconciliationReview.panelForFuelEntry(receiptId);

    const issues: FuelReceiptIssue[] =
      row.workflowStatus === FuelEntryWorkflowStatus.driver_review
        ? []
        : validateFuelReceiptDraft({
            purchasedAt: row.enteredAt.toISOString(),
            liters: num(row.liters),
            pricePerLiter: num(row.pricePerLiter),
            fuelGrossAmount: num(row.totalCost),
            receiptGrossAmount: num(row.receiptGrossAmount),
            receiptNetAmount: num(row.receiptNetAmount),
            receiptVatAmount: num(row.receiptVatAmount),
            receiptVatRate: num(row.receiptVatRate),
            currency: row.currency,
            fuelProduct: row.fuelProduct,
            odometerKm: num(row.odometerKm),
          });

    return {
      id: row.id,
      workflowStatus: row.workflowStatus,
      vehicle: { id: row.vehicle.id, plateNumber: row.vehicle.plateNumber },
      driver: {
        id: row.driver.id,
        name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
      },
      // Yakit niyeti OZETI — koordinat ve secim baglami tasinmiyor.
      fuelingIntent: row.fuelingIntent
        ? {
            id: row.fuelingIntent.id,
            stationName: row.fuelingIntent.stationName,
            selectedFuelProduct: row.fuelingIntent.selectedFuelProduct,
            quotedPricePerLitre: num(row.fuelingIntent.quotedPricePerLitre),
            selectedAt: row.fuelingIntent.selectedAt.toISOString(),
            status: row.fuelingIntent.status,
          }
        : null,
      stationName: row.stationName,
      stationAddress: row.stationAddress,
      receiptNumber: row.receiptNumber,
      purchasedAt: row.enteredAt.toISOString(),
      fuelProduct: row.fuelProduct,
      liters: num(row.liters),
      pricePerLiter: num(row.pricePerLiter),
      fuelGrossAmount: num(row.totalCost),
      receiptGrossAmount: num(row.receiptGrossAmount),
      receiptNetAmount: num(row.receiptNetAmount),
      receiptVatAmount: num(row.receiptVatAmount),
      receiptVatRate: num(row.receiptVatRate),
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      odometerKm: num(row.odometerKm),
      receiptPlateNumber: row.receiptPlateNumber,
      isFullTank: row.isFullTank,
      /** Karma fis: yakit satiri ile kasada odenen tutar AYRI. */
      mixedReceipt: isMixedReceipt(num(row.totalCost), num(row.receiptGrossAmount)),
      compatibilityMismatch: row.compatibilityMismatch,
      duplicateSuspected: duplicates.has(row.id),
      issues,
      ocr: {
        status: row.ocrStatus,
        provider: row.ocrProvider,
        processedAt: row.ocrProcessedAt?.toISOString() ?? null,
        errorClass: row.ocrErrorClass,
        dataMode: row.ocrDataMode,
        // HAM saglayici cevabi DEGIL: normalize edilmis snapshot.
        extraction,
        lowConfidenceFields: lowConfidenceFields(extraction),
        lowConfidenceThreshold: LOW_OCR_CONFIDENCE,
      },
      // Yetkili akis; HAM DEPOLAMA YOLU verilmiyor.
      fileDownloadPath: `/fleet/fuel-receipts/${row.id}/file`,
      fileName: row.receiptOriginalName,
      mimeType: row.receiptMimeType,
      timeline: {
        uploadedAt: row.createdAt.toISOString(),
        ocrProcessedAt: row.ocrProcessedAt?.toISOString() ?? null,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        resubmittedAt: row.resubmittedAt?.toISOString() ?? null,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        rejectedAt: row.rejectedAt?.toISOString() ?? null,
      },
      review: {
        reviewedBy: row.reviewedBy
          ? { id: row.reviewedBy.id, name: row.reviewedBy.fullName }
          : null,
        accountingNote: row.accountingNote,
        rejectionReason: row.rejectionReason,
      },
      /**
       * ETKILI muhasebe durumu (Faz 9).
       *
       * `workflowStatus` ham gercegi tasimaya devam ediyor — onay gercekten
       * yasandi ve kayit silinmedi. Ekranin sordugu soru ise "bu tutar su an
       * gecerli mi": ters kayit ikinciyi degistirir, birincisini degil.
       */
      effectiveAccountingStatus: effectiveAccountingStatus(
        row.workflowStatus,
        row.reversal != null,
      ),
      reversal: row.reversal
        ? {
            id: row.reversal.id,
            reasonCode: row.reversal.reasonCode,
            reason: row.reversal.reason,
            reversedAt: row.reversal.reversedAt.toISOString(),
            reversedBy: row.reversal.reversedBy
              ? { id: row.reversal.reversedBy.id, name: row.reversal.reversedBy.fullName }
              : null,
            replacementEntryId: row.reversal.replacementEntryId,
          }
        : null,
      correctionOf: row.correctionOf
        ? {
            reversalId: row.correctionOf.id,
            originalEntryId: row.correctionOf.originalEntryId,
            reversedAt: row.correctionOf.reversedAt.toISOString(),
          }
        : null,
      /**
       * Telematik kontrolu. `null` = fis heniz onaylanmadi (analiz yalnizca
       * ONAYDAN SONRA baslar) ya da bu kayit onay akisindan once olusmus.
       */
      reconciliation,
      /** Optimistic concurrency icin istemcinin geri gonderecegi deger. */
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Ters kayit servisinin ayni kayit cozumunu tekrar etmemesi icin. */
  async requireReceiptForReversal(receiptId: string) {
    return this.requireReceipt(receiptId);
  }

  async approve(userId: string, receiptId: string, dto: ApproveFuelReceiptDto) {
    return this.transition(userId, receiptId, {
      kind: 'approve',
      expectedUpdatedAt: dto.expectedUpdatedAt,
      accountingNote: dto.accountingNote?.trim() || null,
    });
  }

  async reject(userId: string, receiptId: string, dto: RejectFuelReceiptDto) {
    return this.transition(userId, receiptId, {
      kind: 'reject',
      expectedUpdatedAt: dto.expectedUpdatedAt,
      reason: dto.reason.trim(),
    });
  }

  /**
   * Onay/ret — ATOMIK.
   *
   * Yaris korumasi tek bir kosullu `updateMany`de: `id + workflowStatus +
   * updatedAt`. `updatedAt` her yazmada degistigi icin surum alani gorevi
   * goruyor. Bu sayede
   *   * iki muhasebeci ayni fisi ayni anda kapatamaz,
   *   * biri onaylarken digeri reddedemez,
   *   * inceleme sirasinda surucu kaydi degistirdiyse (yeniden gonderim)
   *     istek kaybeder.
   * Kaybeden taraf `count === 0` alir ve 409 doner — once-oku-sonra-yaz
   * yapsaydik iki istek de "submitted" gorup ikisi de yazardi.
   *
   * IDEMPOTENCY: kaybeden istek once mevcut duruma bakiyor. Kayit ZATEN
   * istenen durumdaysa bu bir cakisma degil, tekrar gonderilmis ayni
   * istektir: ayni sonuc doner ve IKINCI bir audit/bildirim URETILMEZ.
   */
  private async transition(
    userId: string,
    receiptId: string,
    input:
      | { kind: 'approve'; expectedUpdatedAt: string; accountingNote: string | null }
      | { kind: 'reject'; expectedUpdatedAt: string; reason: string },
  ) {
    const before = await this.requireReceipt(receiptId);
    const expected = new Date(input.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'fuel_receipt_review_conflict' });
    }

    const target =
      input.kind === 'approve'
        ? FuelEntryWorkflowStatus.approved
        : FuelEntryWorkflowStatus.rejected;

    // Tekrarlanan ayni istek: yeni yazma yok, yeni bildirim yok.
    if (before.workflowStatus === target) {
      return { receipt: await this.detail(receiptId), changed: false };
    }

    if (before.workflowStatus !== FuelEntryWorkflowStatus.submitted) {
      // `approved` bu fazda IMMUTABLE terminal durum; `driver_review` ve
      // `rejected` ise heniz muhasebeye gelmemis demektir.
      throw new ConflictException({
        code: 'fuel_receipt_not_reviewable',
        status: before.workflowStatus,
      });
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fleetFuelEntry.updateMany({
        where: {
          id: receiptId,
          workflowStatus: FuelEntryWorkflowStatus.submitted,
          updatedAt: expected,
        },
        data:
          input.kind === 'approve'
            ? {
                workflowStatus: FuelEntryWorkflowStatus.approved,
                reviewedById: userId,
                reviewedAt: now,
                accountingNote: input.accountingNote,
              }
            : {
                workflowStatus: FuelEntryWorkflowStatus.rejected,
                reviewedById: userId,
                reviewedAt: now,
                rejectedAt: now,
                rejectionReason: input.reason,
                // Ret, yakit niyeti kilidini SERBEST BIRAKIR: fis kesinlesmedi.
                fuelingIntentSettledKey: null,
              },
      });

      /**
       * Telematik mutabakati (Faz 11) — ONAY ILE AYNI TRANSACTION'DA.
       *
       * Burada telematik OKUNMUYOR: yalnizca `pending` bir satir yaziliyor.
       * Bu yuzden telematik/analiz tarafi tamamen coksede onay yine basarili
       * olur; is kaybolmaz, beklemede kalir. Transaction disinda "unut-gitsin"
       * bir cagri yapsaydik, surec o anda yeniden baslarsa analiz hic
       * olusmazdi ve bunu kimse fark etmezdi.
       */
      const enqueued =
        input.kind === 'approve' && updated.count > 0
          ? await this.reconciliation.enqueueWithin(tx, receiptId)
          : false;

      return { claimed: updated, enqueued };
    });

    const claimed = outcome.claimed;

    if (claimed.count === 0) {
      const current = await this.prisma.fleetFuelEntry.findFirst({
        where: { id: receiptId },
        select: { workflowStatus: true },
      });
      // Arada baskasi AYNI kararı verdiyse bu bir cakisma degil.
      if (current?.workflowStatus === target) {
        return { receipt: await this.detail(receiptId), changed: false };
      }
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_receipt.review_conflict',
        entityType: 'FleetFuelEntry',
        entityId: receiptId,
        summary: `Beleg-Review Konflikt (${input.kind})`,
        metadata: { fuelEntryId: receiptId, attempted: input.kind },
      });
      throw new ConflictException({ code: 'fuel_receipt_review_conflict' });
    }

    await this.recordReview(userId, receiptId, input, before);
    if (outcome.enqueued) {
      // Transaction ZATEN COMMIT OLDU. Buradaki bir hata onayi geri almaz ama
      // istemciye 500 olarak doner ve muhasebeci onayin gecmedigini sanip
      // tekrar dener. Denetim kaydinin eksik kalmasi, onayin belirsiz
      // gorunmesinden iyidir.
      try {
        await this.reconciliation.logEnqueued(userId, receiptId);
      } catch (error) {
        this.logger.warn(`fuel reconciliation audit failed for ${receiptId}: ${error}`);
      }
    }
    return { receipt: await this.detail(receiptId), changed: true };
  }

  private async recordReview(
    userId: string,
    receiptId: string,
    input:
      | { kind: 'approve'; accountingNote: string | null }
      | { kind: 'reject'; reason: string },
    before: Awaited<ReturnType<FuelReceiptReviewService['requireReceipt']>>,
  ): Promise<void> {
    const approved = input.kind === 'approve';

    await this.audit.logAction({
      actorUserId: userId,
      action: approved ? 'fuel_receipt.approved' : 'fuel_receipt.rejected',
      entityType: 'FleetFuelEntry',
      entityId: receiptId,
      summary: approved
        ? `Tankbeleg freigegeben (${before.vehicle.plateNumber})`
        : `Tankbeleg zur Korrektur zurückgegeben (${before.vehicle.plateNumber})`,
      // Fis goruntusu, ham OCR metni ve odeme bilgisi BURAYA GIRMEZ.
      metadata: {
        fuelEntryId: receiptId,
        driverId: before.driver.id,
        vehicleId: before.vehicle.id,
        previousStatus: before.workflowStatus,
        newStatus: approved ? 'approved' : 'rejected',
        // Ret nedeni denetimde duruyor: "neden geri gonderildi" sorusunun
        // cevabi kaydin kendisi degisse bile kaybolmamali.
        ...(approved ? {} : { reason: input.reason }),
        occurredAt: new Date().toISOString(),
      },
    });

    // Bildirim YALNIZCA ilgili surucuye. Muhasebedeki her kullaniciya haber
    // vermek gurultu olurdu; kuyrugu zaten ekranda goruyorlar.
    const driverUser = await this.prisma.driver.findFirst({
      where: { id: before.driver.id },
      select: { userId: true },
    });
    if (!driverUser?.userId) {
      return;
    }

    this.driverNotify.notifyUserSafely({
      userId: driverUser.userId,
      key: approved ? 'fuel_receipt_approved' : 'fuel_receipt_rejected',
      params: {
        plateNumber: before.vehicle.plateNumber,
        station: before.stationName ?? '—',
        ...(approved ? {} : { reason: input.reason }),
      },
      type: 'system',
      priority: approved ? 'low' : 'medium',
      relatedEntityType: 'FleetFuelEntry',
      relatedEntityId: receiptId,
    });
  }

  /** Fis goruntusu — muhasebe icin yetkili akis. */
  async resolveFileForReview(
    receiptId: string,
  ): Promise<{ storedFileName: string; mimeType: string; fileName: string }> {
    const row = await this.prisma.fleetFuelEntry.findFirst({
      where: { id: receiptId, receiptStoredPath: { not: null } },
      select: { receiptStoredPath: true, receiptMimeType: true, receiptOriginalName: true },
    });
    if (!row?.receiptStoredPath) {
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return {
      // Yalnizca son parca: veritabanindan gelen metnin dizin disina cikmasina
      // izin verilmiyor.
      storedFileName: row.receiptStoredPath.split('/').pop() ?? '',
      mimeType: row.receiptMimeType ?? 'application/octet-stream',
      fileName: row.receiptOriginalName ?? 'beleg',
    };
  }
}
