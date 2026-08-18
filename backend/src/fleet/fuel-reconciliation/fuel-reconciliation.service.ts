import { Injectable, Logger } from '@nestjs/common';
import {
  FuelEntryWorkflowStatus,
  FleetTripStatus,
  FuelReconciliationRiskLevel,
  FuelReconciliationStatus,
  LocationSource,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OperationalNotifyService } from '../../notifications/operational-notify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../tenant/tenant-context';
import {
  FUEL_RECONCILIATION_ALGORITHM_VERSION,
  FUEL_RECONCILIATION_THRESHOLDS as T,
} from './core/fuel-reconciliation-config';
import { evaluateFuelReconciliation } from './core/fuel-reconciliation.engine';
import type {
  FuelReconciliationInput,
  FuelReconciliationOutcome,
} from './core/fuel-reconciliation.types';

/**
 * Analize giren fisler: YALNIZCA muhasebe onaylilar. Ters kayda alinmis olan
 * bu sorguda da disaridadir — geri alinmis bir tutari yeniden incelemeye
 * cagirmak, kapanmis bir isi kuyruga geri koymak olurdu.
 */
const ACTIVE_ENTRY_FILTER: Prisma.FleetFuelEntryWhereInput = {
  workflowStatus: FuelEntryWorkflowStatus.approved,
  reversal: { is: null },
};

const RISK_ORDER: Record<FuelReconciliationRiskLevel, number> = {
  high_attention: 3,
  review_required: 2,
  normal: 1,
  insufficient_data: 0,
};

/**
 * Faz 11 — onayli yakit fisinin telematikle mutabakati.
 *
 * NE YAPMAZ: maliyeti degistirmez, fisi geri almaz, surucuye bir sey
 * yazmaz. Ciktisi yalnizca finansal rollerin gordugu bir OKUMA.
 *
 * NEDEN ONAYDAN SONRA: onay oncesi bir risk skoru, muhasebenin kararini
 * makinenin tahminine bagimli hale getirirdi. Once insan onaylar, sonra
 * sistem "sunlara bakmak isteyebilirsin" der.
 */
@Injectable()
export class FuelReconciliationService {
  private readonly logger = new Logger(FuelReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: OperationalNotifyService,
  ) {}

  /**
   * Fis onayinin AYNI transaction'inda calisir.
   *
   * NEDEN TRANSACTION ICINDE: onay yazildi ama analiz kaydi olusmadi diye bir
   * ara durum olmamali. Ve NEDEN SADECE BIR SATIR: burada telematik
   * okunmuyor, hicbir dis servise gidilmiyor — telematik ayakta olmasa bile
   * onay basarili olur, is yalnizca `pending` olarak durur.
   *
   * `skipDuplicates`: ayni fis icin ikinci bir satir yaratmak yerine sessizce
   * gecer (tekrar gonderilmis onay istegi).
   */
  async enqueueWithin(
    tx: Prisma.TransactionClient,
    fuelEntryId: string,
  ): Promise<boolean> {
    const created = await tx.fuelReconciliation.createMany({
      data: [{ fuelEntryId, status: FuelReconciliationStatus.pending }],
      skipDuplicates: true,
    });
    return created.count > 0;
  }

  /** Onay sonrasi denetim kaydi — transaction disinda, onayi bloklamadan. */
  async logEnqueued(actorUserId: string, fuelEntryId: string): Promise<void> {
    await this.audit.logAction({
      actorUserId,
      action: 'fuel_reconciliation.created',
      entityType: 'FuelReconciliation',
      entityId: fuelEntryId,
      summary: 'Telematikabgleich eingeplant',
      metadata: { fuelEntryId, algorithmVersion: FUEL_RECONCILIATION_ALGORITHM_VERSION },
    });
  }

  // =====================================================================
  // Worker
  // =====================================================================

  /**
   * Bekleyen analizleri isler.
   *
   * Kiraci kapsami disinda listelenir, HER SATIR kendi kiracisinin
   * baglaminda hesaplanir: tek bir sorguyla butun filolari tarayip sonra
   * kiraci filtresini unutmak, bu projedeki en pahali hata sinifi olurdu.
   */
  async processPending(limit = 50): Promise<{ processed: number; failed: number }> {
    const rows = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.fuelReconciliation.findMany({
        where: {
          status: FuelReconciliationStatus.pending,
          attemptCount: { lt: T.maxCalculationAttempts },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, tenantId: true },
      }),
    );

    let processed = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await TenantContext.run(row.tenantId, () => this.calculate(row.id, 'initial'));
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.markFailed(row.tenantId, row.id, error);
      }
    }

    return { processed, failed };
  }

  /**
   * Gec gelen telematik verisi icin yeniden hesaplama.
   *
   * YALNIZCA ACIK incelemeler: muhasebe bir kaydi kapattiysa, sonradan gelen
   * bir paket onu sessizce yeniden acmaz. Kapali kayit ancak insanin kendisi
   * tekrar acarsa degisir.
   */
  async recalculateOpen(limit = 50): Promise<{ recalculated: number; changed: number }> {
    const now = Date.now();
    const rows = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.fuelReconciliation.findMany({
        where: {
          status: FuelReconciliationStatus.calculated,
          reviewState: 'open',
          createdAt: { gte: new Date(now - T.recalculationWindowHours * 3_600_000) },
          OR: [
            { recalculatedAt: null },
            {
              recalculatedAt: {
                lt: new Date(now - T.recalculationMinIntervalMinutes * 60_000),
              },
            },
          ],
          fuelEntry: ACTIVE_ENTRY_FILTER,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, tenantId: true },
      }),
    );

    let recalculated = 0;
    let changed = 0;

    for (const row of rows) {
      try {
        const result = await TenantContext.run(row.tenantId, () =>
          this.calculate(row.id, 'recalculation'),
        );
        recalculated += 1;
        if (result.changed) {
          changed += 1;
        }
      } catch (error) {
        await this.markFailed(row.tenantId, row.id, error);
      }
    }

    return { recalculated, changed };
  }

  /** Saklama suresi dolmus yakit seviyesi orneklerini siler. */
  async purgeExpiredFuelLevelSamples(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3_600_000);
    const deleted = await TenantContext.runUnscoped(() =>
      this.prisma.unscoped.vehicleFuelLevelSample.deleteMany({
        where: { recordedAt: { lt: cutoff } },
      }),
    );
    return deleted.count;
  }

  private async markFailed(tenantId: string, id: string, error: unknown): Promise<void> {
    const failureClass = error instanceof Error ? error.name : 'unknown_error';
    // Saglayici/veritabani mesaji KAYDA GIRMEZ: disari yalnizca sinif cikar.
    this.logger.warn(`fuel reconciliation ${id} failed: ${failureClass}`);
    await TenantContext.run(tenantId, async () => {
      const current = await this.prisma.fuelReconciliation.findFirst({
        where: { id },
        select: { attemptCount: true },
      });
      const attemptCount = (current?.attemptCount ?? 0) + 1;
      await this.prisma.fuelReconciliation.updateMany({
        where: { id },
        data: {
          attemptCount,
          failureClass,
          status:
            attemptCount >= T.maxCalculationAttempts
              ? FuelReconciliationStatus.failed
              : FuelReconciliationStatus.pending,
        },
      });
    });
  }

  // =====================================================================
  // Hesaplama
  // =====================================================================

  /** Kiraci baglaminda cagrilmali. */
  async calculate(
    reconciliationId: string,
    mode: 'initial' | 'recalculation',
  ): Promise<{ changed: boolean; outcome: FuelReconciliationOutcome | null }> {
    const row = await this.prisma.fuelReconciliation.findFirst({
      where: { id: reconciliationId },
      select: {
        id: true,
        riskLevel: true,
        riskScore: true,
        notifiedAt: true,
        fuelEntry: {
          select: {
            id: true,
            vehicleId: true,
            enteredAt: true,
            liters: true,
            pricePerLiter: true,
            totalCost: true,
            fuelProduct: true,
            compatibilityMismatch: true,
            reversal: { select: { id: true } },
            vehicle: {
              select: {
                id: true,
                plateNumber: true,
                fuelTankCapacityLiters: true,
                avgConsumptionLPer100Km: true,
              },
            },
            fuelingIntent: {
              select: {
                stationLatitude: true,
                stationLongitude: true,
                quotedPricePerLitre: true,
                priceRetrievedAt: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      return { changed: false, outcome: null };
    }

    const input = await this.buildInput(row.fuelEntry);
    const outcome = evaluateFuelReconciliation(input);

    const previousRisk = row.riskLevel;
    const changed =
      previousRisk !== outcome.riskLevel ||
      row.riskScore !== outcome.riskScore;

    const now = new Date();
    await this.prisma.fuelReconciliation.updateMany({
      where: { id: reconciliationId },
      data: {
        status: FuelReconciliationStatus.calculated,
        riskLevel: outcome.riskLevel as FuelReconciliationRiskLevel,
        riskScore: outcome.riskScore,
        signals: outcome.signals as unknown as Prisma.InputJsonValue,
        dataQuality: outcome.dataQuality as unknown as Prisma.InputJsonValue,
        evidence: outcome.evidence as unknown as Prisma.InputJsonValue,
        algorithmVersion: outcome.algorithmVersion,
        calculatedAt: now,
        failureClass: null,
        ...(mode === 'recalculation' ? { recalculatedAt: now } : {}),
      },
    });

    await this.audit.logAction({
      action:
        mode === 'initial'
          ? 'fuel_reconciliation.calculated'
          : 'fuel_reconciliation.recalculated',
      entityType: 'FuelReconciliation',
      entityId: reconciliationId,
      summary: `Telematikabgleich: ${outcome.riskLevel} (${row.fuelEntry.vehicle.plateNumber})`,
      // Ham GPS izi, telematik paketi ve fis icerigi denetime KOPYALANMAZ.
      metadata: {
        fuelEntryId: row.fuelEntry.id,
        vehicleId: row.fuelEntry.vehicleId,
        riskLevel: outcome.riskLevel,
        riskScore: outcome.riskScore,
        signalCodes: outcome.signals.map((signal) => signal.code),
        algorithmVersion: outcome.algorithmVersion,
      },
    });

    if (mode === 'recalculation' && previousRisk !== outcome.riskLevel) {
      await this.audit.logAction({
        action: 'fuel_reconciliation.risk_level_changed',
        entityType: 'FuelReconciliation',
        entityId: reconciliationId,
        summary: `Risikostufe geändert: ${previousRisk} → ${outcome.riskLevel}`,
        metadata: {
          fuelEntryId: row.fuelEntry.id,
          previousRiskLevel: previousRisk,
          newRiskLevel: outcome.riskLevel,
        },
      });
    }

    await this.maybeNotify(reconciliationId, row, outcome);

    return { changed, outcome };
  }

  /**
   * `high_attention` bildirimi — fis basina EN FAZLA BIR KEZ.
   *
   * `notifiedAt` kosullu `updateMany` ile alindigi icin, ayni kayit icin iki
   * es zamanli hesaplama da tek bildirim uretir.
   */
  private async maybeNotify(
    reconciliationId: string,
    row: { notifiedAt: Date | null; fuelEntry: { id: string; enteredAt: Date; reversal: { id: string } | null; vehicle: { plateNumber: string } } },
    outcome: FuelReconciliationOutcome,
  ): Promise<void> {
    if (outcome.riskLevel !== 'high_attention' || row.notifiedAt !== null) {
      return;
    }
    // Ters kayda alinmis fis icin bildirim gitmez: muhasebe o tutari zaten
    // geri almis durumda.
    if (row.fuelEntry.reversal) {
      return;
    }

    const claimed = await this.prisma.fuelReconciliation.updateMany({
      where: { id: reconciliationId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
    if (claimed.count === 0) {
      return;
    }

    await this.notify.notifyFinancialUsers({
      key: 'fuel_reconciliation_high_attention',
      params: {
        plateNumber: row.fuelEntry.vehicle.plateNumber,
        date: row.fuelEntry.enteredAt.toISOString().slice(0, 10),
      },
      type: 'system',
      priority: 'medium',
      relatedEntityType: 'FuelReconciliation',
      relatedEntityId: reconciliationId,
    });
  }

  // =====================================================================
  // Girdi toplama
  // =====================================================================

  private async buildInput(entry: {
    id: string;
    vehicleId: string;
    enteredAt: Date;
    liters: Prisma.Decimal | null;
    pricePerLiter: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    fuelProduct: string | null;
    compatibilityMismatch: boolean;
    vehicle: {
      fuelTankCapacityLiters: Prisma.Decimal | null;
      avgConsumptionLPer100Km: Prisma.Decimal | null;
    };
    fuelingIntent: {
      stationLatitude: Prisma.Decimal;
      stationLongitude: Prisma.Decimal;
      quotedPricePerLitre: Prisma.Decimal | null;
      priceRetrievedAt: Date | null;
    } | null;
  }): Promise<FuelReconciliationInput> {
    const receiptMs = entry.enteredAt.getTime();
    const levelFrom = new Date(receiptMs - T.levelWindowBeforeMinutes * 60_000);
    const levelTo = new Date(receiptMs + T.levelWindowAfterMinutes * 60_000);
    const positionFrom = new Date(receiptMs - T.positionWindowMinutes * 60_000);
    const positionTo = new Date(receiptMs + T.positionWindowMinutes * 60_000);
    const duplicateFrom = new Date(receiptMs - T.duplicateWindowMinutes * 60_000);
    const duplicateTo = new Date(receiptMs + T.duplicateWindowMinutes * 60_000);

    const [samples, positions, siblings, previousEntry] = await Promise.all([
      this.prisma.vehicleFuelLevelSample.findMany({
        where: {
          vehicleId: entry.vehicleId,
          recordedAt: { gte: levelFrom, lte: levelTo },
        },
        orderBy: { recordedAt: 'asc' },
        select: { recordedAt: true, fuelLevelPct: true, ignition: true, odometerKm: true },
      }),
      // Konum GECMISI: telematik kaynakli satirlar. Bu faz icin YENI bir GPS
      // deposu acilmadi — var olan seri kullaniliyor.
      this.prisma.driverLocationHistory.findMany({
        where: {
          vehicleId: entry.vehicleId,
          source: LocationSource.telematics,
          recordedAt: { gte: positionFrom, lte: positionTo },
        },
        orderBy: { recordedAt: 'asc' },
        take: 500,
        select: { recordedAt: true, latitude: true, longitude: true },
      }),
      this.prisma.fleetFuelEntry.findMany({
        where: {
          id: { not: entry.id },
          vehicleId: entry.vehicleId,
          enteredAt: { gte: duplicateFrom, lte: duplicateTo },
          workflowStatus: {
            in: [FuelEntryWorkflowStatus.submitted, FuelEntryWorkflowStatus.approved],
          },
          // Ters kayda alinmis kopya "tekrar" sayilmaz: muhasebe onu zaten
          // gecersiz kilmis.
          reversal: { is: null },
        },
        take: 20,
        select: { id: true, enteredAt: true, liters: true, totalCost: true, receiptNumber: true },
      }),
      this.prisma.fleetFuelEntry.findFirst({
        where: {
          id: { not: entry.id },
          vehicleId: entry.vehicleId,
          enteredAt: { lt: entry.enteredAt },
          ...ACTIVE_ENTRY_FILTER,
        },
        orderBy: { enteredAt: 'desc' },
        select: { enteredAt: true },
      }),
    ]);

    let distanceSincePreviousReceiptKm: Prisma.Decimal | null = null;
    if (previousEntry) {
      // YALNIZCA KAPANMIS turler: acik bir turun mesafesi heniz nihai degil.
      const distance = await this.prisma.fleetTrip.aggregate({
        where: {
          vehicleId: entry.vehicleId,
          status: FleetTripStatus.closed,
          startedAt: { gte: previousEntry.enteredAt },
          endedAt: { lte: entry.enteredAt },
        },
        _sum: { distanceKm: true },
      });
      distanceSincePreviousReceiptKm = distance._sum.distanceKm ?? null;
    }

    return {
      receipt: {
        enteredAt: entry.enteredAt,
        liters: entry.liters,
        pricePerLiter: entry.pricePerLiter,
        totalCost: entry.totalCost,
        fuelProduct: entry.fuelProduct,
        compatibilityMismatch: entry.compatibilityMismatch,
      },
      vehicle: {
        fuelTankCapacityLiters: entry.vehicle.fuelTankCapacityLiters,
        avgConsumptionLPer100Km: entry.vehicle.avgConsumptionLPer100Km,
      },
      fuelingIntent: entry.fuelingIntent,
      fuelLevelSamples: samples,
      positions,
      siblingReceipts: siblings,
      distanceSincePreviousReceiptKm,
      now: new Date(),
    };
  }

  /** Risk siralamasi — liste "en agir once" gosterebilsin. */
  static riskWeight(level: FuelReconciliationRiskLevel): number {
    return RISK_ORDER[level];
  }
}
