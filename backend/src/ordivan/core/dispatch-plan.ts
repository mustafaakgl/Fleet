import { DEFAULT_TRUCK_PROFILE, type GeoPoint, type RouteSummary, type TruckProfile } from '../../routing/core/routing.types';
import { decisionOf, isRecommendable, type DispatchCheckStatus } from './dispatch-eligibility';

/**
 * DISPATCH PLANI — SAF KISIM (Faz 17).
 *
 * Bu modul HICBIR SEY OKUMAZ ve HICBIR SEY YAZMAZ. Aldigi sey: sunucunun
 * belirledigi adaylar, ajanin siralamasi ve rota sonucu. Urettigi sey: nihai
 * sira, durak ETA'lari ve rota durumu.
 *
 * AJANIN SIRALAMASI BIR ONERIDIR, KARAR DEGIL. Sunucu once UYGUNLUGA gore
 * sinifliyor (eligible > review_required > blocked), ajanin sirasi yalnizca
 * AYNI SINIF ICINDE gecerli. Boylece bir modelin uygunsuz bir araci basa
 * koymasi mumkun degil — en fazla iki uygun aday arasinda tercih belirtir.
 */

// ---------------------------------------------------------------------------
// Referans cozumleme
// ---------------------------------------------------------------------------

export interface ServerCandidate {
  /** SUNUCUNUN urettigi kisa referans (`c1`, `c2`...). Ajan bunu geri yollar. */
  ref: string;
  vehicleId: string;
  driverId: string;
  overall: DispatchCheckStatus;
}

export interface AgentRanking {
  candidateRef: string;
  rank: number;
  rationaleKey: string;
}

export class DispatchRefError extends Error {
  constructor(readonly reason: string, readonly ref?: string) {
    super(ref ? `${reason} (${ref})` : reason);
    this.name = 'DispatchRefError';
  }
}

export interface RankedCandidate extends ServerCandidate {
  /** Nihai sira — 1 en iyi. */
  position: number;
  /** Ajanin bu aday icin verdigi gerekce; yoksa `null`. */
  rationaleKey: string | null;
  /** Ajanin onerdigi sira; yoksa `null`. */
  agentRank: number | null;
  /** Bu aday "onerilen" olarak GOSTERILEBILIR mi. */
  recommendable: boolean;
}

/**
 * AJANIN SIRALAMASINI SUNUCUNUN ADAYLARINA UYGULAR.
 *
 * TANIMSIZ REFERANS SESSIZCE ATILMAZ, HATA VERIR. Ajanin uydurdugu bir
 * referans, sunucunun hic degerlendirmedigi bir araci plana sokmanin yoluydu;
 * yok saymak bunu gorunmez kilardi. Yanit reddedilir ve is basarisiz olur.
 *
 * TEKRARLANAN REFERANS DA HATA: ayni aday iki kez siralanirsa hangi sira
 * gecerli belirsizlesir.
 *
 * SIRALAMA ONCE UYGUNLUGA GORE: ajan `blocked` bir adayi 1. siraya koysa bile
 * sunucu onu uygun adaylarin ARDINA atar. Model siralar, sunucu karar verir.
 */
export function applyAgentRanking(
  candidates: readonly ServerCandidate[],
  rankings: readonly AgentRanking[],
): RankedCandidate[] {
  const byRef = new Map(candidates.map((item) => [item.ref, item]));
  const seen = new Set<string>();

  for (const ranking of rankings) {
    if (!byRef.has(ranking.candidateRef)) {
      throw new DispatchRefError('unknown_candidate_ref', ranking.candidateRef);
    }
    if (seen.has(ranking.candidateRef)) {
      throw new DispatchRefError('duplicate_candidate_ref', ranking.candidateRef);
    }
    seen.add(ranking.candidateRef);
  }

  const agentRankByRef = new Map(rankings.map((item) => [item.candidateRef, item]));

  /** Uygunluk sinifi — kucuk olan once gelir. */
  const tier = (overall: DispatchCheckStatus): number => {
    const decision = decisionOf(overall);
    if (decision === 'eligible') return 0;
    if (decision === 'review_required') return 1;
    return 2;
  };

  const sorted = [...candidates].sort((left, right) => {
    const tierDiff = tier(left.overall) - tier(right.overall);
    if (tierDiff !== 0) return tierDiff;

    // AYNI SINIF ICINDE ajanin sirasi gecerli. Siralanmamis adaylar sona.
    const leftRank = agentRankByRef.get(left.ref)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = agentRankByRef.get(right.ref)?.rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    // KARARLI SIRALAMA: esitlikte referansa gore. Aksi halde ayni girdi
    // farkli calistirmalarda farkli sira uretebilirdi.
    return left.ref.localeCompare(right.ref);
  });

  return sorted.map((candidate, index) => ({
    ...candidate,
    position: index + 1,
    rationaleKey: agentRankByRef.get(candidate.ref)?.rationaleKey ?? null,
    agentRank: agentRankByRef.get(candidate.ref)?.rank ?? null,
    // AJAN `review_required` ADAYI "ONERILEN" GOSTEREMEZ.
    recommendable: isRecommendable(candidate.overall),
  }));
}

// ---------------------------------------------------------------------------
// Kamyon profili
// ---------------------------------------------------------------------------

export interface VehicleDimensions {
  heightCm: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  grossWeightKg: number | null;
}

/**
 * ARAC OLCULERINDEN KAMYON PROFILI.
 *
 * EKSIK OLCU `DEFAULT_TRUCK_PROFILE`a duser ve bu GUVENLI YON: repodaki
 * varsayilan 40 t / 4,0 m'lik standart bir cekici-dorse. Fazla kisitli profil
 * daha uzun ama GECERLI bir rota uretir; eksik kisitli profil aracin fiziksel
 * olarak giremeyecegi bir rota uretir (bkz. routing.types).
 *
 * DIKKAT: bu varsayim ROTA icin guvenli, UYGUNLUK icin degil. Kapasite
 * kontrolu ayri ve orada eksik veri `unknown` uretir — burada varsayilan
 * kullanmak, oradaki `unknown`i ORTADAN KALDIRMAZ.
 */
export function toTruckProfile(
  dimensions: VehicleDimensions,
  hazmat: boolean,
): TruckProfile {
  return {
    height: dimensions.heightCm !== null ? dimensions.heightCm / 100 : DEFAULT_TRUCK_PROFILE.height,
    width: dimensions.widthCm !== null ? dimensions.widthCm / 100 : DEFAULT_TRUCK_PROFILE.width,
    length: dimensions.lengthCm !== null ? dimensions.lengthCm / 100 : DEFAULT_TRUCK_PROFILE.length,
    weight:
      dimensions.grossWeightKg !== null
        ? dimensions.grossWeightKg / 1000
        : DEFAULT_TRUCK_PROFILE.weight,
    axleLoad: DEFAULT_TRUCK_PROFILE.axleLoad,
    hazmat,
  };
}

// ---------------------------------------------------------------------------
// Rota ve ETA
// ---------------------------------------------------------------------------

export type DispatchRouteStatus = 'ok' | 'degraded' | 'failed';

export interface PlannedStop {
  sequence: number;
  kind: 'pickup' | 'delivery';
  locationId: string;
  /** Varis zamani (ISO). Rota basarisizsa `null` — UYDURULMAZ. */
  etaAt: string | null;
  legDistanceKm: number | null;
  legDurationMin: number | null;
}

export interface RoutePlan {
  status: DispatchRouteStatus;
  /** Teknik hata SINIFI. Saglayici mesaji DEGIL. */
  failureClass: string | null;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  stops: PlannedStop[];
}

export interface StopInput {
  kind: 'pickup' | 'delivery';
  locationId: string;
  point: GeoPoint;
  /** Duraktaki islem suresi (dk). */
  serviceMinutes: number;
}

const EARTH_RADIUS_KM = 6371;

/** Kus ucusu mesafe — YALNIZCA degradation tahmininde. */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const toRad = (value: number): number => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * KABA TAHMIN ICIN ORTALAMA HIZ (km/s).
 *
 * Kamyon icin muhafazakar bir deger. Bu sayi bir OLCUM DEGIL ve uretilen plan
 * `degraded` isaretlendigi icin ekranda da tahmin oldugu gorunur.
 */
export const DEGRADED_AVERAGE_SPEED_KMH = 60;

/**
 * ROTA SONUCUNU PLANA CEVIRIR.
 *
 * UC DURUM:
 *   - `ok`       — Valhalla cevap verdi; mesafe, sure ve ETA GERCEK rotadan.
 *   - `degraded` — Valhalla cevap vermedi; kus ucusu mesafeden KABA bir tahmin
 *                  uretiliyor ve ACIKCA isaretleniyor. Dispatcher neyin tahmin
 *                  oldugunu bilmeli; sessizce tahmin sunmak, gercek bir ETA
 *                  gibi gorunur ve musteriye o saat soylenirdi.
 *   - `failed`   — tahmin bile uretilemiyor (koordinat yok). ETA `null` kalir;
 *                  UYDURULMAZ.
 *
 * `startAt` verilmezse ETA hesaplanmaz — baslangic saati bilinmeden varis
 * saati uretmek, bir tahmini kesin bir taahhude cevirmek olurdu.
 */
export function buildRoutePlan(input: {
  stops: readonly StopInput[];
  summary: RouteSummary | null;
  failureClass: string | null;
  startAt: Date | null;
}): RoutePlan {
  if (input.stops.length === 0) {
    return { status: 'failed', failureClass: 'no_stops', totalDistanceKm: null, totalDurationMin: null, stops: [] };
  }

  const legs = input.summary?.legs ?? [];
  const degraded = input.summary === null;

  // Bacak dokumunu ya gercek rotadan ya da kus ucusundan uret.
  const derivedLegs = input.stops.slice(1).map((stop, index) => {
    const previous = input.stops[index]!;
    if (!degraded && legs[index]) {
      return {
        distanceKm: legs[index]!.distanceKm,
        durationMinutes: legs[index]!.durationMinutes,
      };
    }
    if (!hasCoordinates(previous.point) || !hasCoordinates(stop.point)) {
      return { distanceKm: null, durationMinutes: null };
    }
    const distanceKm = haversineKm(previous.point, stop.point);
    return {
      distanceKm,
      durationMinutes: (distanceKm / DEGRADED_AVERAGE_SPEED_KMH) * 60,
    };
  });

  const anyLegMissing = derivedLegs.some((leg) => leg.distanceKm === null);
  const status: DispatchRouteStatus = degraded ? (anyLegMissing ? 'failed' : 'degraded') : 'ok';

  // ETA: baslangictan itibaren bacak sureleri + durak islem sureleri.
  let cursor = input.startAt ? new Date(input.startAt.getTime()) : null;
  const stops: PlannedStop[] = input.stops.map((stop, index) => {
    if (index > 0 && cursor) {
      const leg = derivedLegs[index - 1]!;
      if (leg.durationMinutes === null) {
        cursor = null;
      } else {
        cursor = new Date(cursor.getTime() + leg.durationMinutes * 60_000);
      }
    }
    const etaAt = cursor ? cursor.toISOString() : null;
    if (cursor) {
      cursor = new Date(cursor.getTime() + stop.serviceMinutes * 60_000);
    }
    const leg = index === 0 ? null : derivedLegs[index - 1]!;
    return {
      sequence: index + 1,
      kind: stop.kind,
      locationId: stop.locationId,
      etaAt,
      legDistanceKm: leg?.distanceKm ?? null,
      legDurationMin: leg?.durationMinutes ?? null,
    };
  });

  const totalDistanceKm =
    status === 'failed'
      ? null
      : !degraded && input.summary
        ? input.summary.distanceKm
        : sum(derivedLegs.map((leg) => leg.distanceKm));
  const totalDurationMin =
    status === 'failed'
      ? null
      : !degraded && input.summary
        ? input.summary.durationMinutes
        : sum(derivedLegs.map((leg) => leg.durationMinutes));

  return {
    status,
    failureClass: degraded ? (input.failureClass ?? 'route_unavailable') : null,
    totalDistanceKm,
    totalDurationMin,
    stops,
  };
}

function hasCoordinates(point: GeoPoint | null | undefined): point is GeoPoint {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

function sum(values: Array<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return Math.round(total * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Konsolidasyon
// ---------------------------------------------------------------------------

/**
 * AJANIN KONSOLIDASYON ONERISINI DOGRULAR.
 *
 * Ajan hangi siparislerin ayni turda tasinabilecegini ONERIR; hangilerinin
 * BIRLIKTE PLANLANABILECEGINE sunucu karar verir. Tanimsiz bir siparis
 * referansi HATA — sessizce atmak, ajanin plana hic degerlendirilmemis bir
 * siparis sokmasina izin verirdi.
 *
 * TEK GUNLUK KURAL: farkli is gunlerine ait siparisler ayni turda
 * birlestirilemez. Bu bir optimizasyon tercihi degil, `Tour.workDate`in tek
 * bir gun tasimasindan gelen yapisal bir kisit.
 */
export function resolveConsolidation(
  offered: readonly { ref: string; transportOrderId: string; workDate: string }[],
  requestedRefs: readonly string[],
): { transportOrderIds: string[]; workDate: string } {
  const byRef = new Map(offered.map((item) => [item.ref, item]));
  const selected: typeof offered[number][] = [];

  for (const ref of requestedRefs) {
    const hit = byRef.get(ref);
    if (!hit) {
      throw new DispatchRefError('unknown_order_ref', ref);
    }
    if (selected.some((item) => item.ref === ref)) {
      throw new DispatchRefError('duplicate_order_ref', ref);
    }
    selected.push(hit);
  }

  if (selected.length === 0) {
    throw new DispatchRefError('no_orders_selected');
  }

  const workDates = new Set(selected.map((item) => item.workDate));
  if (workDates.size > 1) {
    throw new DispatchRefError('mixed_work_dates');
  }

  return {
    transportOrderIds: selected.map((item) => item.transportOrderId),
    workDate: selected[0]!.workDate,
  };
}
