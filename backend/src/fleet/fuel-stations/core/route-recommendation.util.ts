import type { FuelProductType } from '@prisma/client';

/**
 * Rota bazli istasyon onerisinin saf mantigi.
 *
 * Saf tutuluyor cunku PARA ve ZAMAN hesabi yapiyor: yanlis bir isaret ya da
 * carpan, surucuyu gereksiz 20 km yola sokar. route-deviation.util.ts ile ayni
 * disiplin — eksik veri "0" degil `null` doner ve sebebi bildirilir.
 */

/** Rota metrigi hesaplanacak en fazla aday. */
export const MAX_ROUTE_CANDIDATES = 10;

/**
 * Kayan nokta ve rotalama toleransindan dogan cok kucuk negatif sapmalar.
 *
 * Neden gerekli: Valhalla ayni yolu iki ayri cagrida milimetrik farkla
 * dondurebiliyor; "konum -> istasyon -> durak" toplaminin baseline'dan 3 metre
 * kisa cikmasi fiziksel bir kisayol degil, gurultudur. Bu bandin ICINDE sifira
 * normalize ediliyor.
 *
 * Bandin DISINDAKI negatifler gizlenmiyor: istasyon `unavailable` isaretlenip
 * loglaniyor — cunku gercekten kisalan bir rota, baseline'in yanlis noktadan
 * hesaplandigini gosterir ve sessizce "-4 km sapma" gostermek yanlis bilgidir.
 */
export const NEGATIVE_DEVIATION_EPSILON_KM = 0.05;
export const NEGATIVE_DEVIATION_EPSILON_MIN = 0.5;

export type RouteMetricsStatus = 'calculated' | 'unavailable';

export interface RouteLegMetric {
  distanceKm: number | null;
  durationMin: number | null;
}

export interface StationRouteMetrics {
  calculationStatus: RouteMetricsStatus;
  roadDistanceToStationKm: number | null;
  driveTimeToStationMin: number | null;
  viaStationDistanceKm: number | null;
  viaStationDurationMin: number | null;
  extraDistanceKm: number | null;
  extraDurationMin: number | null;
  /** Istasyona tahmini SURUS varisi. Yakit alma suresi DAHIL DEGIL. */
  stationEta: string | null;
}

export const UNAVAILABLE_ROUTE_METRICS: StationRouteMetrics = {
  calculationStatus: 'unavailable',
  roadDistanceToStationKm: null,
  driveTimeToStationMin: null,
  viaStationDistanceKm: null,
  viaStationDurationMin: null,
  extraDistanceKm: null,
  extraDurationMin: null,
  stationEta: null,
};

/** Sonlu ve negatif olmayan mesafe/sure. NaN, Infinity ve negatif REDDEDILIR. */
export function isUsableMetric(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Kucuk negatifleri sifira normalize eder; bandin disindaysa null doner.
 *
 * null donmesi cagirana "bu istasyonu unavailable isaretle" demektir.
 */
export function normalizeDeviation(value: number, epsilon: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value >= 0) {
    return value;
  }
  return value >= -epsilon ? 0 : null;
}

export interface StationRouteInput {
  /** mevcut konum -> sonraki tur duragi */
  baseline: RouteLegMetric;
  /** mevcut konum -> istasyon */
  toStation: RouteLegMetric;
  /** istasyon -> sonraki tur duragi */
  stationToNextStop: RouteLegMetric;
  /** ETA'nin dayanagi; verilmezse stationEta null kalir. */
  departureAt?: Date;
}

/**
 * Tek bir istasyonun rota metrikleri.
 *
 *   viaStation = (konum -> istasyon) + (istasyon -> durak)
 *   extra      = viaStation - baseline
 *
 * Segmentlerin HEPSI ayni costing profili ve ayni birimlerle hesaplanmis
 * olmali; karisik profil ile toplanan bir sapma anlamsizdir (bkz.
 * RouteRecommendationService, tek profil tek matris cagrisi).
 */
export function computeStationRouteMetrics(input: StationRouteInput): {
  metrics: StationRouteMetrics;
  /** Bandin disinda negatif cikti mi — cagiran bunu loglar. */
  suspiciousNegative: boolean;
} {
  const { baseline, toStation, stationToNextStop } = input;

  const usable =
    isUsableMetric(baseline.distanceKm) &&
    isUsableMetric(baseline.durationMin) &&
    isUsableMetric(toStation.distanceKm) &&
    isUsableMetric(toStation.durationMin) &&
    isUsableMetric(stationToNextStop.distanceKm) &&
    isUsableMetric(stationToNextStop.durationMin);

  if (!usable) {
    return { metrics: UNAVAILABLE_ROUTE_METRICS, suspiciousNegative: false };
  }

  const viaStationDistanceKm = toStation.distanceKm! + stationToNextStop.distanceKm!;
  const viaStationDurationMin = toStation.durationMin! + stationToNextStop.durationMin!;

  const rawExtraDistance = viaStationDistanceKm - baseline.distanceKm!;
  const rawExtraDuration = viaStationDurationMin - baseline.durationMin!;

  const extraDistanceKm = normalizeDeviation(rawExtraDistance, NEGATIVE_DEVIATION_EPSILON_KM);
  const extraDurationMin = normalizeDeviation(rawExtraDuration, NEGATIVE_DEVIATION_EPSILON_MIN);

  if (extraDistanceKm === null || extraDurationMin === null) {
    // Anlamli negatif: gizlenmiyor, unavailable olarak bildiriliyor.
    return { metrics: UNAVAILABLE_ROUTE_METRICS, suspiciousNegative: true };
  }

  const stationEta =
    input.departureAt && !Number.isNaN(input.departureAt.getTime())
      ? new Date(input.departureAt.getTime() + toStation.durationMin! * 60_000).toISOString()
      : null;

  return {
    metrics: {
      calculationStatus: 'calculated',
      roadDistanceToStationKm: round(toStation.distanceKm!, 2),
      driveTimeToStationMin: round(toStation.durationMin!, 1),
      viaStationDistanceKm: round(viaStationDistanceKm, 2),
      viaStationDurationMin: round(viaStationDurationMin, 1),
      extraDistanceKm: round(extraDistanceKm, 2),
      extraDurationMin: round(extraDurationMin, 1),
      stationEta,
    },
    suspiciousNegative: false,
  };
}

/** Aday secimi icin istasyonun ihtiyac duyulan alanlari. */
export interface CandidateStation {
  id: string;
  distanceKm: number | null;
  isOpen: boolean | null;
  offerings: Array<{ productType: FuelProductType; pricePerUnit: number | null }>;
}

/**
 * Rota hesabi yapilacak adaylarin secimi.
 *
 * KURAL (belgelenmis ve test edilmis): istasyonlar uc katmana ayrilir ve her
 * katman kendi icinde kus ucusu mesafeye gore siralanir; esitlik kimlikle
 * cozulur (deterministik).
 *
 *   1. ACIK ve en az bir FIYATLI teklifi olan  -> surucunun gercekten
 *      kullanabilecegi istasyonlar
 *   2. ACIK ya da fiyatli (biri)               -> kismen kullanilabilir
 *   3. geri kalan                              -> kapali ve fiyatsiz
 *
 * Neden katmanli: yalnizca mesafeye gore secilse, kapali ya da fiyati
 * bilinmeyen 10 yakin istasyon TUM iyi adaylari listeden dislar ve surucu
 * gercekte kullanabilecegi bir istasyonun sapmasini hic gormez. Tersi de
 * yanlis olurdu — kapali istasyonlar tamamen atilirsa liste ile rota metrigi
 * tutarsiz olur. Bu yuzden kapali/fiyatsiz istasyonlar ELENMEZ, yalnizca
 * SIRAYA en sona alinir.
 */
export function selectRouteCandidates<T extends CandidateStation>(
  stations: readonly T[],
  limit: number = MAX_ROUTE_CANDIDATES,
): T[] {
  const tier = (station: T): number => {
    const open = station.isOpen === true;
    const priced = station.offerings.some((offering) => isUsableMetric(offering.pricePerUnit));
    if (open && priced) return 0;
    if (open || priced) return 1;
    return 2;
  };

  return [...stations]
    .sort((left, right) => {
      const tierDiff = tier(left) - tier(right);
      if (tierDiff !== 0) return tierDiff;

      const leftDistance = left.distanceKm;
      const rightDistance = right.distanceKm;
      if (leftDistance === null && rightDistance !== null) return 1;
      if (leftDistance !== null && rightDistance === null) return -1;
      if (leftDistance !== null && rightDistance !== null && leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Sapmanin yakit maliyeti.
 *
 * route-deviation.util.ts ile AYNI formul: litre = km * (L/100km) / 100.
 * Tuketim ya da fiyat yoksa null — uydurma varsayilan KULLANILMAZ (aracin
 * gercek tuketimi bilinmiyorken euro gostermek, olmayan bir kesinlik iddiasi).
 */
export function estimateDetourFuelCost(params: {
  extraDistanceKm: number | null;
  consumptionLPer100Km: number | null;
  pricePerLiter: number | null;
}): { liters: number | null; costEur: number | null } {
  if (
    !isUsableMetric(params.extraDistanceKm) ||
    !isUsableMetric(params.consumptionLPer100Km) ||
    params.consumptionLPer100Km === 0
  ) {
    return { liters: null, costEur: null };
  }

  const liters = round((params.extraDistanceKm * params.consumptionLPer100Km) / 100, 3);

  if (!isUsableMetric(params.pricePerLiter) || params.pricePerLiter === 0) {
    return { liters, costEur: null };
  }

  return { liters, costEur: round(liters * params.pricePerLiter, 2) };
}
