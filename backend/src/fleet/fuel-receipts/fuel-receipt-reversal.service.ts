import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FuelEntryWorkflowStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { DriverNotifyService } from '../../notifications/driver-notify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../tenant/tenant-context';
import {
  hasBlockingIssue,
  validateFuelReceiptDraft,
} from './core/fuel-receipt-validation.util';
import type {
  ReverseFuelReceiptDto,
  UpdateFuelReceiptCorrectionDto,
} from './dto/reverse-fuel-receipt.dto';
import { FuelReceiptReviewService } from './fuel-receipt-review.service';

/**
 * Onaylanmis yakit fisinin ters kaydi ve duzeltilmis kopyasi.
 *
 * NEDEN SILME/DUZENLEME DEGIL: onaylanmis bir kaydi yerinde degistirmek,
 * "muhasebe neyi onayladi" sorusunun cevabini yok eder ve fis goruntusuyle
 * kayit birbirini tutmaz hale gelir. Silmek ise ayni seyi daha sert yapar.
 * Bunun yerine orijinal DOKUNULMADAN kaliyor ve yanina append-only bir ters
 * kayit dusuyor; raporlar "etkili onay" kuralindan (bkz.
 * `effective-fuel-cost.ts`) gectigi icin toplamlar kendiliginden duzeliyor.
 *
 * NEDEN NEGATIF SATIR YOK: ters kayit bir GIDER degil, bir gecerlilik
 * ifadesidir. Negatif bir satir yazsaydik ters kaydin girildigi ay sahte bir
 * negatif giderle kirlenir, orijinal ay ise yanlis kalmaya devam ederdi.
 * Dogru davranis tutarin KENDI doneminden dusmesi.
 */
@Injectable()
export class FuelReceiptReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly driverNotify: DriverNotifyService,
    private readonly review: FuelReceiptReviewService,
  ) {}

  private requireTenantId(): string {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      // Kiraci baglami yoksa yazma YAPILMAZ. `default-tenant`a dusmek, bir
      // kiracinin duzeltmesini baskasinin defterine yazmak olurdu.
      throw new NotFoundException({ code: 'fuel_receipt_not_found' });
    }
    return tenantId;
  }

  /**
   * Ters kayit.
   *
   * ATOMIK: reversal, replacement ve orijinalin "kilitlenmesi" tek
   * transaction'da. Yarida kalirsa hicbiri kalmaz — ters kaydi olusup
   * replacement'i olusmamis bir fis, muhasebeyi elle onarilamaz bir duruma
   * sokardi.
   */
  async reverse(userId: string, receiptId: string, dto: ReverseFuelReceiptDto) {
    const tenantId = this.requireTenantId();
    const before = await this.review.requireReceiptForReversal(receiptId);

    // Aciklama DTO'da trim'lendi; yalnizca bosluktan olusan metin uzunluk
    // kontrolune takilir. Yine de sunucuda son bir kez bakiyoruz cunku bu
    // metin aylar sonra denetimde okunacak tek insan ifadesi.
    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException({ code: 'fuel_receipt_invalid_reversal_reason' });
    }

    if (before.workflowStatus !== FuelEntryWorkflowStatus.approved) {
      // `driver_review`/`submitted` heniz maliyete girmedi: geri alinacak bir
      // sey yok, kayit zaten reddedilebilir. `rejected` de maliyet disinda.
      throw new ConflictException({
        code: 'fuel_receipt_not_approved',
        status: before.workflowStatus,
      });
    }

    if (before.reversal) {
      throw new ConflictException({
        code: 'fuel_receipt_already_reversed',
        reversalId: before.reversal.id,
      });
    }

    const expected = new Date(dto.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'fuel_receipt_reversal_conflict' });
    }

    const now = new Date();
    let createdReversalId: string;
    let createdReplacementId: string | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        /**
         * ORIJINALE DOKUNMADAN yaris korumasi.
         *
         * `updateMany` yalnizca `updatedAt`i tazeliyor — tek bir finansal alan
         * bile yazilmiyor. Amaci iki tane: (1) istemcinin gordugu surumun hala
         * gecerli oldugunu kanitlamak, (2) es zamanli bir onay/ret ile bu ters
         * kaydin ayni kayit uzerinde carpismasini engellemek.
         */
        const claimed = await tx.fleetFuelEntry.updateMany({
          where: {
            id: receiptId,
            workflowStatus: FuelEntryWorkflowStatus.approved,
            updatedAt: expected,
          },
          data: { updatedAt: now },
        });
        if (claimed.count === 0) {
          throw new ConflictException({ code: 'fuel_receipt_reversal_conflict' });
        }

        const replacement = dto.createReplacement
          ? await tx.fleetFuelEntry.create({
              data: this.buildReplacementData(before, now),
              select: { id: true },
            })
          : null;

        const reversal = await tx.fleetFuelEntryReversal.create({
          data: {
            tenantId,
            originalEntryId: receiptId,
            replacementEntryId: replacement?.id ?? null,
            reasonCode: dto.reasonCode,
            reason,
            reversedById: userId,
            reversedAt: now,
          },
          select: { id: true },
        });

        return { reversalId: reversal.id, replacementId: replacement?.id ?? null };
      });
      createdReversalId = result.reversalId;
      createdReplacementId = result.replacementId;
    } catch (caught) {
      /**
       * Ikinci es zamanli istek BURADA duruyor.
       *
       * Uygulama kontrolu (`before.reversal`) iki istegi birlikte gecirebilir;
       * `originalEntryId` uzerindeki UNIQUE indeks gecirmez. Kaybeden taraf
       * P2002 alir ve deterministik bir 409'a cevrilir — transaction geri
       * sarildigi icin yarim bir replacement da kalmaz.
       */
      if (
        caught instanceof Prisma.PrismaClientKnownRequestError &&
        caught.code === 'P2002'
      ) {
        throw new ConflictException({ code: 'fuel_receipt_already_reversed' });
      }
      throw caught;
    }

    await this.recordReversal(userId, receiptId, {
      reversalId: createdReversalId,
      replacementId: createdReplacementId,
      reasonCode: dto.reasonCode,
      reason,
      before,
    });

    return {
      receipt: await this.review.detail(receiptId),
      replacement: createdReplacementId
        ? await this.review.detail(createdReplacementId)
        : null,
    };
  }

  /**
   * Duzeltilmis kopyanin verisi.
   *
   * KOPYALANMAYANLAR ve sebepleri:
   *   * `receiptFileHash` — `@@unique([tenantId, receiptFileHash])`. Kopyalamak
   *     dogrudan kisit ihlali olurdu. Hash orijinal YUKLEMENIN tekilligini
   *     korur; duzeltme yeni bir yukleme degil.
   *   * `fuelingIntentId` / `fuelingIntentSettledKey` — yakit niyeti ZATEN
   *     orijinal tarafindan kapatildi ve orijinal duruyor. Ikinci bir kayda
   *     tasimak, ayni niyeti iki kez kesinlesmis gostermek ve tekil indekse
   *     carpmak olurdu.
   *   * OCR alanlari — duzeltme muhasebenin elle girdigi bir kayittir; OCR
   *     guvenini ondan devralmak, hic yapilmamis bir makine okumasini
   *     yapilmis gibi gostermek olur.
   *   * inceleme alanlari (`reviewedBy`, `accountingNote`, `rejectionReason`)
   *     — yeni kayit heniz incelenmedi.
   *
   * DOSYA COGALTILMIYOR: `receiptStoredPath` ayni dosyayi isaret ediyor.
   * Ikinci bir fiziksel kopya, ayni belgenin iki surumunu uretir ve silme
   * politikasini belirsiz birakirdi. Indirme ucu her iki kayit icin de
   * kiraci ve rol kontrollu kaliyor.
   */
  private buildReplacementData(
    before: Awaited<ReturnType<FuelReceiptReviewService['requireReceiptForReversal']>>,
    now: Date,
  ): Prisma.FleetFuelEntryUncheckedCreateInput {
    return {
      vehicleId: before.vehicle.id,
      driverId: before.driver.id,
      enteredAt: before.enteredAt,
      liters: before.liters,
      totalCost: before.totalCost,
      currency: before.currency,
      odometerKm: before.odometerKm,
      isFullTank: before.isFullTank,

      stationName: before.stationName,
      stationAddress: before.stationAddress,
      receiptNumber: before.receiptNumber,
      fuelProduct: before.fuelProduct,
      pricePerLiter: before.pricePerLiter,
      receiptGrossAmount: before.receiptGrossAmount,
      receiptNetAmount: before.receiptNetAmount,
      receiptVatAmount: before.receiptVatAmount,
      receiptVatRate: before.receiptVatRate,
      paymentMethod: before.paymentMethod,
      receiptPlateNumber: before.receiptPlateNumber,
      compatibilityMismatch: before.compatibilityMismatch,

      // Ayni fiziksel dosya paylasiliyor; ikinci kopya URETILMIYOR.
      receiptStoredPath: before.receiptStoredPath,
      receiptMimeType: before.receiptMimeType,
      receiptOriginalName: before.receiptOriginalName,

      /**
       * MEVCUT inceleme akisina giriyor — yeni bir yasam dongusu YOK.
       *
       * `submitted`: muhasebe kuyrugunda gorunur, mevcut approve/reject
       * uclariyla incelenir. `approved` ile baslasaydi ters kayit ile yeni
       * onay tek istege duser ve "iki goz" kuralini yok ederdi.
       */
      workflowStatus: FuelEntryWorkflowStatus.submitted,
      submittedAt: now,
    };
  }

  /**
   * Duzeltme kaydinin duzenlenmesi.
   *
   * SADECE: ters kayittan dogmus + heniz onaylanmamis + kendisi ters kayda
   * alinmamis kayitlar. Bu uc kosul olmadan uc, onaylanmis kayitlari yerinde
   * duzenlemenin arka kapisi olurdu.
   */
  async updateCorrection(
    userId: string,
    receiptId: string,
    dto: UpdateFuelReceiptCorrectionDto,
  ) {
    const before = await this.review.requireReceiptForReversal(receiptId);

    if (!before.correctionOf) {
      throw new ConflictException({ code: 'fuel_receipt_not_a_correction' });
    }
    if (before.reversal) {
      throw new ConflictException({ code: 'fuel_receipt_already_reversed' });
    }
    if (before.workflowStatus !== FuelEntryWorkflowStatus.submitted) {
      // Onaylanmis bir duzeltme artik yerinde degistirilemez: onu da ters
      // kayda almak gerekir. Zincirin anlami bu.
      throw new ConflictException({
        code: 'fuel_receipt_correction_not_editable',
        status: before.workflowStatus,
      });
    }

    const expected = new Date(dto.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'fuel_receipt_review_conflict' });
    }

    const receiptGross = dto.receiptGrossAmount ?? dto.fuelGrossAmount;
    // Dogrulama KOPYALANMIYOR: surucu akisinin kullandigi ayni saf yardimci.
    const issues = validateFuelReceiptDraft({
      purchasedAt: dto.purchasedAt,
      liters: dto.liters,
      pricePerLiter: dto.pricePerLiter ?? null,
      fuelGrossAmount: dto.fuelGrossAmount,
      receiptGrossAmount: receiptGross,
      receiptNetAmount: dto.receiptNetAmount ?? null,
      receiptVatAmount: dto.receiptVatAmount ?? null,
      receiptVatRate: dto.receiptVatRate ?? null,
      currency: dto.currency,
      fuelProduct: dto.fuelProduct,
      odometerKm: dto.odometerKm ?? null,
    });
    if (hasBlockingIssue(issues)) {
      throw new BadRequestException({ code: 'fuel_receipt_invalid', issues });
    }

    const dec = (value: number | undefined | null) =>
      value === undefined || value === null ? null : new Prisma.Decimal(value);

    const claimed = await this.prisma.fleetFuelEntry.updateMany({
      where: {
        id: receiptId,
        workflowStatus: FuelEntryWorkflowStatus.submitted,
        updatedAt: expected,
      },
      data: {
        enteredAt: new Date(dto.purchasedAt),
        fuelProduct: dto.fuelProduct,
        liters: new Prisma.Decimal(dto.liters),
        pricePerLiter: dec(dto.pricePerLiter),
        totalCost: new Prisma.Decimal(dto.fuelGrossAmount),
        receiptGrossAmount: new Prisma.Decimal(receiptGross),
        receiptNetAmount: dec(dto.receiptNetAmount),
        receiptVatAmount: dec(dto.receiptVatAmount),
        receiptVatRate: dec(dto.receiptVatRate),
        currency: dto.currency.trim().toUpperCase(),
        stationName: dto.stationName ?? null,
        stationAddress: dto.stationAddress ?? null,
        receiptNumber: dto.receiptNumber ?? null,
        paymentMethod: dto.paymentMethod ?? null,
        odometerKm: dec(dto.odometerKm),
        receiptPlateNumber: dto.receiptPlateNumber ?? null,
        isFullTank: dto.isFullTank ?? false,
        // KAYDETMEK ONAYLAMAZ: durum `submitted` kaliyor, onay ayri bir
        // istekle ve mevcut approve ucundan geciyor.
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException({ code: 'fuel_receipt_review_conflict' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'fuel_receipt.correction_edited',
      entityType: 'FleetFuelEntry',
      entityId: receiptId,
      summary: `Korrekturbeleg bearbeitet (${before.vehicle.plateNumber})`,
      // Fis goruntusu, ham OCR metni ve odeme bilgisi BURAYA GIRMEZ.
      metadata: {
        fuelEntryId: receiptId,
        reversalId: before.correctionOf.id,
        originalEntryId: before.correctionOf.originalEntryId,
        vehicleId: before.vehicle.id,
        before: {
          totalCost: before.totalCost?.toString() ?? null,
          currency: before.currency,
          enteredAt: before.enteredAt.toISOString(),
        },
        after: {
          totalCost: new Prisma.Decimal(dto.fuelGrossAmount).toString(),
          currency: dto.currency.trim().toUpperCase(),
          enteredAt: new Date(dto.purchasedAt).toISOString(),
        },
        occurredAt: new Date().toISOString(),
      },
    });

    return { receipt: await this.review.detail(receiptId), issues };
  }

  private async recordReversal(
    userId: string,
    receiptId: string,
    input: {
      reversalId: string;
      replacementId: string | null;
      reasonCode: string;
      reason: string;
      before: Awaited<ReturnType<FuelReceiptReviewService['requireReceiptForReversal']>>;
    },
  ): Promise<void> {
    const { before } = input;

    await this.audit.logAction({
      actorUserId: userId,
      action: 'fuel_receipt.reversed',
      entityType: 'FleetFuelEntry',
      entityId: receiptId,
      summary: `Tankbeleg storniert (${before.vehicle.plateNumber})`,
      metadata: {
        fuelEntryId: receiptId,
        reversalId: input.reversalId,
        replacementEntryId: input.replacementId,
        vehicleId: before.vehicle.id,
        driverId: before.driver.id,
        reasonCode: input.reasonCode,
        reason: input.reason,
        // Orijinal kaydin DEGISMEDIGI denetimde de gorunsun: ters kayittan
        // once ve sonra ayni tutar.
        originalAmount: before.totalCost?.toString() ?? null,
        originalCurrency: before.currency,
        originalEnteredAt: before.enteredAt.toISOString(),
        occurredAt: new Date().toISOString(),
      },
    });

    if (input.replacementId) {
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_receipt.correction_created',
        entityType: 'FleetFuelEntry',
        entityId: input.replacementId,
        summary: `Korrekturbeleg angelegt (${before.vehicle.plateNumber})`,
        metadata: {
          fuelEntryId: input.replacementId,
          reversalId: input.reversalId,
          originalEntryId: receiptId,
          vehicleId: before.vehicle.id,
          occurredAt: new Date().toISOString(),
        },
      });
    }

    // Surucuye GENEL bilgi. Muhasebe aciklamasi, sebep kodu ve ic notlar
    // GONDERILMIYOR: surucu ne yaptigini bilmedigi bir duzeltmenin
    // gerekcesini okumak zorunda degil ve metin ic degerlendirme icerebilir.
    const driverUser = await this.prisma.driver.findFirst({
      where: { id: before.driver.id },
      select: { userId: true },
    });
    if (!driverUser?.userId) {
      return;
    }

    this.driverNotify.notifyUserSafely({
      userId: driverUser.userId,
      key: 'fuel_receipt_reversed',
      params: {
        plateNumber: before.vehicle.plateNumber,
        station: before.stationName ?? '—',
      },
      type: 'system',
      priority: 'low',
      relatedEntityType: 'FleetFuelEntry',
      relatedEntityId: receiptId,
    });
  }
}
