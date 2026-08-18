import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FuelReconciliationReviewOutcome,
  FuelReconciliationReviewState,
  FuelReconciliationRiskLevel,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListFuelReconciliationsQueryDto, ReviewFuelReconciliationDto } from './dto/fuel-reconciliation.dto';
import {
  toReconciliationPanel,
  toReconciliationRow,
  type FuelReconciliationPanel,
  type FuelReconciliationRow,
} from './fuel-reconciliation-view';

const DEFAULT_PAGE_SIZE = 25;

const PANEL_SELECT = {
  id: true,
  fuelEntryId: true,
  status: true,
  riskLevel: true,
  riskScore: true,
  signals: true,
  dataQuality: true,
  evidence: true,
  algorithmVersion: true,
  calculatedAt: true,
  recalculatedAt: true,
  reviewState: true,
  reviewOutcome: true,
  reviewNote: true,
  reviewedAt: true,
  reviewedBy: { select: { id: true, fullName: true } },
  updatedAt: true,
} satisfies Prisma.FuelReconciliationSelect;

const ROW_SELECT = {
  id: true,
  fuelEntryId: true,
  riskLevel: true,
  riskScore: true,
  reviewState: true,
  reviewOutcome: true,
  signals: true,
  calculatedAt: true,
  updatedAt: true,
  fuelEntry: {
    select: {
      enteredAt: true,
      liters: true,
      totalCost: true,
      currency: true,
      vehicle: { select: { id: true, plateNumber: true } },
    },
  },
} satisfies Prisma.FuelReconciliationSelect;

/**
 * Ters kayda alinmis fisin analizi AKTIF KUYRUKTA GORUNMEZ.
 *
 * Silinmiyor: gecmis analiz ve denetim kaydi yerinde duruyor, yalnizca
 * muhasebenin uzerinde calistigi listeden cikiyor. "Geri alinmis bir tutar
 * icin risk incelemesi" tanim geregi bitmis bir istir.
 */
const ACTIVE_QUEUE_FILTER: Prisma.FuelReconciliationWhereInput = {
  fuelEntry: { reversal: { is: null } },
};

/**
 * Muhasebenin mutabakat listesi, detayi ve inceleme karari.
 *
 * SURUCU BU SERVISE HIC GELMEZ (bkz. controller rol siniri). Surucunun
 * ucundan yalnizca "fisiniz inceleniyor" bilgisi cikiyor; risk seviyesi,
 * puan, kural adlari ve inceleme notu BU TARAFTA KALIR.
 */
@Injectable()
export class FuelReconciliationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListFuelReconciliationsQueryDto): Promise<{
    rows: FuelReconciliationRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    summary: { openCount: number; highAttentionCount: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);

    const where: Prisma.FuelReconciliationWhereInput = { ...ACTIVE_QUEUE_FILTER };
    if (query.riskLevel) where.riskLevel = query.riskLevel;
    if (query.reviewState) where.reviewState = query.reviewState;

    const entryFilter: Prisma.FleetFuelEntryWhereInput = { reversal: { is: null } };
    if (query.vehicleId) entryFilter.vehicleId = query.vehicleId;
    if (query.from || query.to) {
      const enteredAt: Prisma.DateTimeFilter = {};
      if (query.from) enteredAt.gte = new Date(query.from);
      if (query.to) enteredAt.lte = new Date(query.to);
      entryFilter.enteredAt = enteredAt;
    }
    where.fuelEntry = entryFilter;

    // `risk` varsayilan: `riskScore` azalan. Kararli `id` tie-break olmadan
    // ayni puanli iki kayit sayfalar arasinda yer degistirir ve biri hic
    // gorunmeyebilir.
    const orderBy: Prisma.FuelReconciliationOrderByWithRelationInput[] =
      query.sort === 'newest'
        ? [{ createdAt: 'desc' }, { id: 'asc' }]
        : query.sort === 'oldest'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ riskScore: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];

    const [total, rows, openCount, highAttentionCount] = await Promise.all([
      this.prisma.fuelReconciliation.count({ where }),
      this.prisma.fuelReconciliation.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ROW_SELECT,
      }),
      this.prisma.fuelReconciliation.count({
        where: {
          ...ACTIVE_QUEUE_FILTER,
          reviewState: FuelReconciliationReviewState.open,
          riskLevel: {
            in: [
              FuelReconciliationRiskLevel.review_required,
              FuelReconciliationRiskLevel.high_attention,
            ],
          },
        },
      }),
      this.prisma.fuelReconciliation.count({
        where: {
          ...ACTIVE_QUEUE_FILTER,
          reviewState: FuelReconciliationReviewState.open,
          riskLevel: FuelReconciliationRiskLevel.high_attention,
        },
      }),
    ]);

    return {
      rows: rows.map(toReconciliationRow),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: { openCount, highAttentionCount },
    };
  }

  /** Araç maliyetleri ekraninin ustundeki rakam. */
  async openSummary(vehicleId?: string): Promise<{
    openCount: number;
    highAttentionCount: number;
  }> {
    const base: Prisma.FuelReconciliationWhereInput = {
      fuelEntry: { reversal: { is: null }, ...(vehicleId ? { vehicleId } : {}) },
      reviewState: FuelReconciliationReviewState.open,
    };

    const [openCount, highAttentionCount] = await Promise.all([
      this.prisma.fuelReconciliation.count({
        where: {
          ...base,
          riskLevel: {
            in: [
              FuelReconciliationRiskLevel.review_required,
              FuelReconciliationRiskLevel.high_attention,
            ],
          },
        },
      }),
      this.prisma.fuelReconciliation.count({
        where: { ...base, riskLevel: FuelReconciliationRiskLevel.high_attention },
      }),
    ]);

    return { openCount, highAttentionCount };
  }

  async detail(id: string): Promise<FuelReconciliationPanel> {
    const row = await this.prisma.fuelReconciliation.findFirst({
      where: { id },
      select: PANEL_SELECT,
    });
    if (!row) {
      // Varligi sizdirilmaz: baska kiracinin kaydi da 404 doner.
      throw new NotFoundException({ code: 'fuel_reconciliation_not_found' });
    }
    return toReconciliationPanel(row);
  }

  /** Fis cekmecesindeki "Telematik kontrolu" paneli. */
  async panelForFuelEntry(fuelEntryId: string): Promise<FuelReconciliationPanel | null> {
    const row = await this.prisma.fuelReconciliation.findFirst({
      where: { fuelEntryId },
      select: PANEL_SELECT,
    });
    return row ? toReconciliationPanel(row) : null;
  }

  /**
   * Inceleme karari — ATOMIK.
   *
   * Mevcut desen: `id + reviewState + updatedAt` uzerinde tek kosullu
   * `updateMany`. Once-oku-sonra-yaz yapsaydik iki muhasebeci ayni kaydi
   * farkli sonuclarla kapatabilirdi.
   *
   * IDEMPOTENCY: kayit ZATEN kapaliysa ve ayni sonucu tasiyorsa bu bir
   * cakisma degil tekrar gonderimdir; ikinci bir denetim kaydi URETILMEZ.
   */
  async review(
    userId: string,
    id: string,
    dto: ReviewFuelReconciliationDto,
  ): Promise<{ reconciliation: FuelReconciliationPanel; changed: boolean }> {
    const before = await this.prisma.fuelReconciliation.findFirst({
      where: { id },
      select: {
        id: true,
        riskLevel: true,
        reviewState: true,
        reviewOutcome: true,
        fuelEntryId: true,
        fuelEntry: { select: { vehicleId: true, vehicle: { select: { plateNumber: true } } } },
      },
    });
    if (!before) {
      throw new NotFoundException({ code: 'fuel_reconciliation_not_found' });
    }

    if (
      before.reviewState === FuelReconciliationReviewState.closed &&
      before.reviewOutcome === dto.outcome
    ) {
      return { reconciliation: await this.detail(id), changed: false };
    }

    const expected = new Date(dto.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ConflictException({ code: 'fuel_reconciliation_review_conflict' });
    }

    const now = new Date();
    const claimed = await this.prisma.fuelReconciliation.updateMany({
      where: { id, updatedAt: expected },
      data: {
        reviewState: FuelReconciliationReviewState.closed,
        reviewOutcome: dto.outcome as FuelReconciliationReviewOutcome,
        reviewNote: dto.note.trim(),
        reviewedById: userId,
        reviewedAt: now,
      },
    });

    if (claimed.count === 0) {
      await this.audit.logAction({
        actorUserId: userId,
        action: 'fuel_reconciliation.review_conflict',
        entityType: 'FuelReconciliation',
        entityId: id,
        summary: 'Telematikabgleich: Review-Konflikt',
        metadata: { fuelEntryId: before.fuelEntryId, attempted: dto.outcome },
      });
      throw new ConflictException({ code: 'fuel_reconciliation_review_conflict' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'fuel_reconciliation.review_completed',
      entityType: 'FuelReconciliation',
      entityId: id,
      summary: `Telematikabgleich abgeschlossen: ${dto.outcome} (${before.fuelEntry.vehicle.plateNumber})`,
      // Not METNI denetime girmiyor: kaydin kendisinde duruyor ve orada
      // duzeltilebiliyor. Denetimde sayilabilir olan SONUC var.
      metadata: {
        fuelEntryId: before.fuelEntryId,
        vehicleId: before.fuelEntry.vehicleId,
        riskLevel: before.riskLevel,
        outcome: dto.outcome,
      },
    });

    return { reconciliation: await this.detail(id), changed: true };
  }
}
