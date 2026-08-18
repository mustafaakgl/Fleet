import type { Prisma } from '@prisma/client';
import type {
  FuelReconciliationDataQuality,
  FuelReconciliationEvidence,
  FuelReconciliationSignal,
} from './core/fuel-reconciliation.types';

/**
 * Muhasebe panelinin gordugu tek sekil.
 *
 * NEDEN TEK MAPPER: ayni veri hem fis cekmecesinde hem mutabakat listesinde
 * gosteriliyor. Iki ayri donusum, bir ekranda "yuksek dikkat" digerinde
 * "normal" yazilmasina acik davetiye olurdu.
 *
 * SURUCUYE GITMEZ: bu sekil yalnizca finansal rollerin ucundan cikar.
 */
export interface FuelReconciliationPanel {
  id: string;
  fuelEntryId: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  signals: FuelReconciliationSignal[];
  dataQuality: FuelReconciliationDataQuality | null;
  evidence: FuelReconciliationEvidence | null;
  algorithmVersion: number;
  calculatedAt: string | null;
  recalculatedAt: string | null;
  review: {
    state: string;
    outcome: string | null;
    note: string | null;
    reviewedAt: string | null;
    reviewedBy: { id: string; name: string } | null;
  };
  updatedAt: string;
}

export interface FuelReconciliationRow {
  id: string;
  fuelEntryId: string;
  riskLevel: string;
  riskScore: number;
  reviewState: string;
  reviewOutcome: string | null;
  signalCodes: string[];
  vehicle: { id: string; plateNumber: string };
  purchasedAt: string;
  liters: number | null;
  fuelGrossAmount: number | null;
  currency: string;
  calculatedAt: string | null;
  updatedAt: string;
}

type JsonLike = Prisma.JsonValue | null;

function asSignals(value: JsonLike): FuelReconciliationSignal[] {
  return Array.isArray(value) ? (value as unknown as FuelReconciliationSignal[]) : [];
}

function asObject<TShape>(value: JsonLike): TShape | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as unknown as TShape)
    : null;
}

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export type ReconciliationRecordForPanel = {
  id: string;
  fuelEntryId: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  signals: JsonLike;
  dataQuality: JsonLike;
  evidence: JsonLike;
  algorithmVersion: number;
  calculatedAt: Date | null;
  recalculatedAt: Date | null;
  reviewState: string;
  reviewOutcome: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedBy: { id: string; fullName: string } | null;
  updatedAt: Date;
};

export function toReconciliationPanel(
  row: ReconciliationRecordForPanel,
): FuelReconciliationPanel {
  return {
    id: row.id,
    fuelEntryId: row.fuelEntryId,
    status: row.status,
    riskLevel: row.riskLevel,
    riskScore: row.riskScore,
    signals: asSignals(row.signals),
    dataQuality: asObject<FuelReconciliationDataQuality>(row.dataQuality),
    evidence: asObject<FuelReconciliationEvidence>(row.evidence),
    algorithmVersion: row.algorithmVersion,
    calculatedAt: row.calculatedAt?.toISOString() ?? null,
    recalculatedAt: row.recalculatedAt?.toISOString() ?? null,
    review: {
      state: row.reviewState,
      outcome: row.reviewOutcome,
      note: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedBy: row.reviewedBy
        ? { id: row.reviewedBy.id, name: row.reviewedBy.fullName }
        : null,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type ReconciliationRecordForRow = {
  id: string;
  fuelEntryId: string;
  riskLevel: string;
  riskScore: number;
  reviewState: string;
  reviewOutcome: string | null;
  signals: JsonLike;
  calculatedAt: Date | null;
  updatedAt: Date;
  fuelEntry: {
    enteredAt: Date;
    liters: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    currency: string;
    vehicle: { id: string; plateNumber: string };
  };
};

export function toReconciliationRow(row: ReconciliationRecordForRow): FuelReconciliationRow {
  return {
    id: row.id,
    fuelEntryId: row.fuelEntryId,
    riskLevel: row.riskLevel,
    riskScore: row.riskScore,
    reviewState: row.reviewState,
    reviewOutcome: row.reviewOutcome,
    signalCodes: asSignals(row.signals).map((signal) => signal.code),
    vehicle: row.fuelEntry.vehicle,
    purchasedAt: row.fuelEntry.enteredAt.toISOString(),
    liters: num(row.fuelEntry.liters),
    fuelGrossAmount: num(row.fuelEntry.totalCost),
    currency: row.fuelEntry.currency,
    calculatedAt: row.calculatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
