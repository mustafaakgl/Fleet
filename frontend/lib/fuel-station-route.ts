import { priceFor } from './fuel-station-view';
import type { FuelProductType, RouteRecommendationStation } from './types';

/**
 * Rota bazli istasyon onerisinin saf mantigi.
 *
 * Ayri dosya: Faz 3'un yakinlik mantigi (fuel-station-view.ts) bozulmadan
 * duruyor, rota metrikleri buraya eklendi. Burada PARA ve ZAMAN kararı
 * uretiliyor — yanlis bir "Onerilen" etiketi surucuyu gereksiz 20 km yola
 * sokar, bu yuzden her kural ayri test ediliyor.
 */

export type FuelStationRouteSortMode =
  /** Mevcut rotaya eklenen en az ekstra kilometre */
  | 'detour'
  /** Istasyona en kisa surus suresi */
  | 'driveTime'
  /** Secili yakit turunun en dusuk litre fiyati */
  | 'price'
  /** Kus ucusu mesafe (Faz 3 davranisi) */
  | 'distance';

export const ROUTE_SORT_MODES: readonly FuelStationRouteSortMode[] = [
  'detour',
  'driveTime',
  'price',
  'distance',
];

/** Rota metrigi hesaplanmis mi. */
export function hasRouteMetrics(station: RouteRecommendationStation): boolean {
  return station.routeMetrics.calculationStatus === 'calculated';
}

function usable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Siralama.
 *
 * Rota olcutlerinde (detour/driveTime) metrigi OLMAYAN istasyonlar en sona
 * gider: null'i kucuk sayan bir karsilastirma onlari "en az sapma" diye basa
 * tasirdi. Esitlikler once ikincil olcu, sonra kimlik ile deterministik
 * cozuluyor — ayni veri iki renderda ayni siralanmali, yoksa "Onerilen"
 * etiketi zipliyor.
 */
export function sortRouteStations(
  stations: readonly RouteRecommendationStation[],
  mode: FuelStationRouteSortMode,
  selectedProduct: FuelProductType | null,
): RouteRecommendationStation[] {
  const byDetour = (a: RouteRecommendationStation, b: RouteRecommendationStation) =>
    compareNullableAsc(a.routeMetrics.extraDistanceKm, b.routeMetrics.extraDistanceKm);

  const byDriveTime = (a: RouteRecommendationStation, b: RouteRecommendationStation) =>
    compareNullableAsc(a.routeMetrics.driveTimeToStationMin, b.routeMetrics.driveTimeToStationMin);

  const byPrice = (a: RouteRecommendationStation, b: RouteRecommendationStation) =>
    compareNullableAsc(priceFor(a, selectedProduct), priceFor(b, selectedProduct));

  const byDistance = (a: RouteRecommendationStation, b: RouteRecommendationStation) =>
    compareNullableAsc(a.distanceKm, b.distanceKm);

  const primary =
    mode === 'detour'
      ? byDetour
      : mode === 'driveTime'
        ? byDriveTime
        : mode === 'price'
          ? byPrice
          : byDistance;

  const secondary = mode === 'distance' ? byDetour : byDistance;

  return [...stations].sort((a, b) => {
    const first = primary(a, b);
    if (first !== 0) return first;
    const second = secondary(a, b);
    if (second !== 0) return second;
    return a.id.localeCompare(b.id);
  });
}

/** null her zaman SONA. */
function compareNullableAsc(left: number | null, right: number | null): number {
  const leftUsable = usable(left);
  const rightUsable = usable(right);
  if (!leftUsable && !rightUsable) return 0;
  if (!leftUsable) return 1;
  if (!rightUsable) return -1;
  return left! - right!;
}

/**
 * "Onerilen" istasyon — secili siralama olcutune gore ilk UYGUN istasyon.
 *
 * "En ucuz", "En yakin" ve "Onerilen" AYNI SEY DEGIL: onerilen, secili olcute
 * gore en iyi olan VE fiilen kullanilabilir olandir.
 *
 * Uygunluk kosullari:
 *   - KAPALI istasyon onerilmez (surucu gidip kapali kapi bulmasin). Listede
 *     gorunmeye devam eder; yalnizca "Onerilen" olmaz.
 *   - Fiyat olcutunde fiyati olmayan istasyon onerilmez.
 *   - Rota olcutlerinde metrigi olmayan istasyon onerilmez.
 */
export function recommendedStationId(
  sortedStations: readonly RouteRecommendationStation[],
  mode: FuelStationRouteSortMode,
  selectedProduct: FuelProductType | null,
): string | null {
  for (const station of sortedStations) {
    if (station.isOpen === false) continue;

    if (mode === 'price' && !usable(priceFor(station, selectedProduct))) continue;
    if (mode === 'detour' && !usable(station.routeMetrics.extraDistanceKm)) continue;
    if (mode === 'driveTime' && !usable(station.routeMetrics.driveTimeToStationMin)) continue;
    if (mode === 'distance' && !usable(station.distanceKm)) continue;

    return station.id;
  }
  return null;
}

/** Aktif tur + rota metrigi varsa varsayilan sapma, aksi halde mesafe. */
export function defaultRouteSortMode(params: {
  mode: 'active_tour' | 'nearby_only';
  anyRouteMetrics: boolean;
}): FuelStationRouteSortMode {
  return params.mode === 'active_tour' && params.anyRouteMetrics ? 'detour' : 'distance';
}

/** Rota olcutu secilebilir mi — metrik yoksa pasif kalmali. */
export function isRouteSortAvailable(
  mode: FuelStationRouteSortMode,
  params: { anyRouteMetrics: boolean; selectedProduct: FuelProductType | null },
): boolean {
  if (mode === 'detour' || mode === 'driveTime') return params.anyRouteMetrics;
  if (mode === 'price') return params.selectedProduct !== null;
  return true;
}

/* ---------------------------------------------------------------------------
 * Bicimlendirme
 * ------------------------------------------------------------------------- */

/** Yol mesafesi; 1 km altinda metre. */
export function formatRoadDistance(km: number | null, locale: string): string | null {
  if (!usable(km)) return null;
  if (km < 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(km * 1000)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(km)} km`;
}

/** Surus suresi; 60 dk ustunde saat + dakika. */
export function formatDriveTime(minutes: number | null, locale: string): string | null {
  if (!usable(minutes)) return null;
  const rounded = Math.round(minutes);
  if (rounded < 60) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded)} min`;
  }
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Gosterim esikleri.
 *
 * SORUN: gosterim hassasiyetinin altindaki GERCEK POZITIF bir sapma
 * yuvarlanarak "+0" cikiyordu — surucu "bu istasyon rotamdan hic saptirmiyor"
 * diye okuyordu. Olculen ornek: 0,6 dk'lik bir sapma "+0 min" olarak
 * gorunuyordu.
 *
 * Cozum yalnizca SUNUM: hesap tam hassasiyetle yapiliyor, esigin altindaki
 * pozitif deger "<esik" olarak yaziliyor. TAM SIFIR ise "+0" kaliyor —
 * "sapma yok" ile "cok kucuk sapma" ayri bilgiler.
 */
export const EXTRA_DISTANCE_DISPLAY_THRESHOLD_KM = 0.1;
export const EXTRA_DURATION_DISPLAY_THRESHOLD_MIN = 1;

/**
 * Rotaya etki: her zaman isaretli (+) yaziliyor.
 *
 * Sifir sapma "+0" olarak gosteriliyor — bos birakmak, hesaplanmadigi
 * izlenimi verirdi. Esigin ALTINDAKI pozitif deger "<0,1 km" olur.
 */
export function formatExtraDistance(km: number | null, locale: string): string | null {
  if (!usable(km)) return null;

  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

  if (km === 0) {
    return `+${format(0)} km`;
  }
  if (km < EXTRA_DISTANCE_DISPLAY_THRESHOLD_KM) {
    return `<${format(EXTRA_DISTANCE_DISPLAY_THRESHOLD_KM)} km`;
  }
  return `+${format(km)} km`;
}

export function formatExtraDuration(minutes: number | null, locale: string): string | null {
  if (!usable(minutes)) return null;

  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

  if (minutes === 0) {
    return `+${format(0)} min`;
  }
  if (minutes < EXTRA_DURATION_DISPLAY_THRESHOLD_MIN) {
    return `<${format(EXTRA_DURATION_DISPLAY_THRESHOLD_MIN)} min`;
  }
  return `+${format(Math.round(minutes))} min`;
}

/** Istasyona tahmini SURUS varisi (saat:dakika). */
export function formatStationEta(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/* ---------------------------------------------------------------------------
 * Ekonomik karsilastirma
 * ------------------------------------------------------------------------- */

/**
 * Planlanan litre girisinin sinirlari.
 *
 * Depoda arac TANK KAPASITESI ALANI YOK (sema kontrol edildi), bu yuzden
 * araca ozel bir sinir UYDURULMUYOR. Ust sinir yalnizca kaba bir guvenlik
 * korkulugu: bir cekici + ek tank pratikte bu degeri asmaz ve yanlis basilan
 * "1500" litre absurd bir tutar uretmesin.
 */
export const MIN_PLANNED_LITRES = 1;
export const MAX_PLANNED_LITRES = 1500;

/**
 * Locale'e uygun sayi girisini cozer.
 *
 * Almanca'da ondalik AYIRICI VIRGUL: "45,5" gecerli bir giristir ve
 * Number("45,5") NaN dondurur. Binlik ayiricisi da temizleniyor.
 */
export function parseLitresInput(raw: string, locale: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const usesCommaDecimal = /^(de|tr|fr|es|it|nl|pl|pt|ru|uk|ro|bg)/i.test(locale);
  const normalized = usesCommaDecimal
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/,/g, '');

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function isPlannedLitresValid(litres: number | null): boolean {
  return litres !== null && litres >= MIN_PLANNED_LITRES && litres <= MAX_PLANNED_LITRES;
}

/**
 * Tahmini YAKIT ALIM tutari.
 *
 * Bu tur maliyeti DEGIL — yalnizca depoya alinacak yakitin tutari.
 */
export function estimatePurchaseCost(params: {
  pricePerLitre: number | null;
  plannedLitres: number | null;
}): number | null {
  if (!usable(params.pricePerLitre) || !usable(params.plannedLitres) || params.plannedLitres === 0) {
    return null;
  }
  return round(params.pricePerLitre * params.plannedLitres, 2);
}

/**
 * Sapmanin isletme maliyeti — YALNIZCA aracin gercek tuketimi biliniyorsa.
 *
 * Formul backend'deki route-deviation.util ile ayni:
 *   litre = ekstra km * (L/100 km) / 100
 *   tutar = litre * litre fiyati
 *
 * Tuketim yoksa null: uydurma bir L/100 km ile euro gostermek, olmayan bir
 * kesinlik iddiasidir. Bu durumda arayuz ekonomik TOPLAMI hic sunmaz.
 */
export function estimateDetourOperatingCost(params: {
  extraDistanceKm: number | null;
  consumptionLPer100Km: number | null;
  pricePerLitre: number | null;
}): number | null {
  if (
    !usable(params.extraDistanceKm) ||
    !usable(params.consumptionLPer100Km) ||
    params.consumptionLPer100Km === 0 ||
    !usable(params.pricePerLitre)
  ) {
    return null;
  }
  const litres = (params.extraDistanceKm * params.consumptionLPer100Km) / 100;
  return round(litres * params.pricePerLitre, 2);
}

/**
 * Tahmini ekonomik secim toplami = yakit alim tutari + sapmanin yakit maliyeti.
 *
 * Iki bilesenden BIRI eksikse null — yarim bir toplam yanlis karsilastirma
 * uretir.
 */
export function estimateStationChoiceCost(params: {
  purchaseCost: number | null;
  detourOperatingCost: number | null;
}): number | null {
  if (params.purchaseCost === null || params.detourOperatingCost === null) {
    return null;
  }
  return round(params.purchaseCost + params.detourOperatingCost, 2);
}

/** Ekonomik karsilastirma sunulabilir mi. */
export function isEconomicComparisonAvailable(consumptionLPer100Km: number | null): boolean {
  return usable(consumptionLPer100Km) && consumptionLPer100Km !== 0;
}

/** Para birimi, kullanicinin diline gore. */
export function formatCurrencyEur(value: number | null, locale: string): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
