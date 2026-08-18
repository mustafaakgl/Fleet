import type { Prisma } from '@prisma/client';
import type { FuelReconciliationSignalGroup } from './fuel-reconciliation-config';

export type Decimal = Prisma.Decimal;

/** Telemetriden gelen tek bir yakit seviyesi olcumu. */
export interface FuelLevelSampleInput {
  /** CIHAZ zamani. */
  recordedAt: Date;
  fuelLevelPct: Decimal;
  ignition: boolean;
  odometerKm: Decimal | null;
}

/** Fis zamani civarindaki arac konumu (telematik kaynakli). */
export interface VehiclePositionInput {
  recordedAt: Date;
  latitude: Decimal;
  longitude: Decimal;
}

/** Ayni aracin yakin zamanli diger kesinlesmis fisi — tekrar adayi. */
export interface SiblingReceiptInput {
  id: string;
  enteredAt: Date;
  liters: Decimal | null;
  totalCost: Decimal | null;
  receiptNumber: string | null;
}

export interface FuelReconciliationInput {
  receipt: {
    enteredAt: Date;
    liters: Decimal | null;
    pricePerLiter: Decimal | null;
    /** YAKIT satirinin brut toplami (fisin genel toplami degil). */
    totalCost: Decimal | null;
    fuelProduct: string | null;
    /** Surucunun onayladigi uyumsuzluk isareti (Faz 6). */
    compatibilityMismatch: boolean;
  };
  vehicle: {
    fuelTankCapacityLiters: Decimal | null;
    avgConsumptionLPer100Km: Decimal | null;
  };
  /** Fise bagli yakit niyeti — istasyon konumu ve fiyat snapshot'inin kaynagi. */
  fuelingIntent: {
    stationLatitude: Decimal;
    stationLongitude: Decimal;
    quotedPricePerLitre: Decimal | null;
    priceRetrievedAt: Date | null;
  } | null;
  fuelLevelSamples: FuelLevelSampleInput[];
  positions: VehiclePositionInput[];
  siblingReceipts: SiblingReceiptInput[];
  /** Onceki onayli fisten bu yana KAPANMIS turlerin toplam mesafesi. */
  distanceSincePreviousReceiptKm: Decimal | null;
  /** Saat kaymasi kontrolu icin referans an. */
  now: Date;
}

export type FuelReconciliationSeverity = 'strong' | 'moderate';

/**
 * Tetiklenen kural.
 *
 * `code` bir CEVIRI ANAHTARI: sunucu kullanici diline hic metin uretmiyor,
 * boylece ayni sonuc de/en/tr'de ayni kaliyor. `values` ise ekranin sayiyi
 * kendi yerelinde bicimlendirebilmesi icin ham degerler.
 */
export interface FuelReconciliationSignal {
  code: string;
  severity: FuelReconciliationSeverity;
  group: FuelReconciliationSignalGroup;
  weight: number;
  values: Record<string, number | string | null>;
}

/** Calistirilamayan kural ve NEDENI — "sessizce atlandi" diye bir sey yok. */
export interface SkippedRule {
  code: string;
  reason: string;
}

export interface FuelReconciliationDataQuality {
  evaluatedRules: string[];
  skippedRules: SkippedRule[];
  fuelLevelSamplesBefore: number;
  fuelLevelSamplesAfter: number;
  hasTankCapacity: boolean;
  hasStationLocation: boolean;
  hasPositions: boolean;
  hasFreshPriceSnapshot: boolean;
  /** Arayuzun "eksik veriler" listesi. */
  missing: string[];
}

export interface FuelReconciliationEvidence {
  receiptLiters: number | null;
  observedIncreaseLiters: number | null;
  observedIncreasePct: number | null;
  absoluteDifferenceLiters: number | null;
  percentageDifference: number | null;
  tankCapacityLiters: number | null;
  levelRiseAt: string | null;
  receiptToRiseMinutes: number | null;
  stationDistanceMeters: number | null;
  closestPositionAt: string | null;
  quotedPricePerLitre: number | null;
  receiptPricePerLiter: number | null;
  priceDeviationRatio: number | null;
  distanceSincePreviousReceiptKm: number | null;
  expectedLitersFromDistance: number | null;
  duplicateCandidateId: string | null;
}

export type FuelReconciliationRisk =
  | 'insufficient_data'
  | 'normal'
  | 'review_required'
  | 'high_attention';

export interface FuelReconciliationOutcome {
  riskLevel: FuelReconciliationRisk;
  riskScore: number;
  signals: FuelReconciliationSignal[];
  dataQuality: FuelReconciliationDataQuality;
  evidence: FuelReconciliationEvidence;
  algorithmVersion: number;
}
