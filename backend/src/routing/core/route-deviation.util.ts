/**
 * Planlanan ve gerceklesen mesafenin karsilastirilmasi.
 *
 * Bu raporun tek cumlelik amaci su: "gecen ay X gorevde fazladan Y km suruldu,
 * yaklasik Z litre, W euro." Satista somut kanit, operasyonda ise paranin
 * nereden kactigini gosteren tek olcu.
 *
 * Saf tutuluyor cunku para hesabi yapiyor: yanlis bir carpan sahada
 * fark edilmeden fatura boyutunda hataya donusur.
 */

export interface DeviationInput {
  /** Valhalla'nin hesapladigi rota (km) */
  plannedKm: number | null;
  /** Aracin GPS'ine gore gerceklesen (km) */
  actualKm: number | null;
  /** Aracin ortalama tuketimi (L/100 km) */
  consumptionLPer100Km: number | null;
  /** Yakit karti islemlerinden turetilen gercek litre fiyati (EUR) */
  pricePerLiter: number | null;
}

export interface DeviationResult {
  /** Gerceklesen - planlanan. Negatif olabilir: planlanandan kisa surulmus. */
  deviationKm: number | null;
  deviationLiters: number | null;
  deviationCostEur: number | null;
  /** Hesap neden yapilamadi — kullaniciya "veri eksik" demek icin */
  missing: DeviationMissing[];
}

export type DeviationMissing = 'planned' | 'actual' | 'consumption' | 'price';

/**
 * Gerceklesen mesafenin planlanandan bu orandan fazla sapmasi "supheli" sayilir.
 *
 * %10 keyfi degil: sehir ici son kilometre, park arayisi ve kucuk sapmalar
 * normalde bu bandin altinda kalir. Ustune cikan fark aciklama ister —
 * yanlis adres, rotadan sapma, ozel gorev.
 */
export const SUSPICIOUS_DEVIATION_RATIO = 0.1;

function isUsable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function computeDeviation(input: DeviationInput): DeviationResult {
  const missing: DeviationMissing[] = [];

  if (!isUsable(input.plannedKm) || input.plannedKm === 0) missing.push('planned');
  if (!isUsable(input.actualKm)) missing.push('actual');
  if (!isUsable(input.consumptionLPer100Km) || input.consumptionLPer100Km === 0) {
    missing.push('consumption');
  }
  if (!isUsable(input.pricePerLiter) || input.pricePerLiter === 0) missing.push('price');

  // Mesafe farki yalnizca iki mesafe de varsa hesaplanir; tuketim/fiyat
  // eksikse km farki yine gosterilir, sadece parasal karsiligi bos kalir.
  const hasDistances = !missing.includes('planned') && !missing.includes('actual');
  if (!hasDistances) {
    return { deviationKm: null, deviationLiters: null, deviationCostEur: null, missing };
  }

  const deviationKm = round(input.actualKm! - input.plannedKm!, 3);

  if (missing.includes('consumption')) {
    return { deviationKm, deviationLiters: null, deviationCostEur: null, missing };
  }

  const deviationLiters = round((deviationKm * input.consumptionLPer100Km!) / 100, 3);

  if (missing.includes('price')) {
    return { deviationKm, deviationLiters, deviationCostEur: null, missing };
  }

  return {
    deviationKm,
    deviationLiters,
    deviationCostEur: round(deviationLiters * input.pricePerLiter!, 2),
    missing,
  };
}

/** Sapma orani; planlanan sifirsa veya eksikse null. */
export function deviationRatio(plannedKm: number | null, actualKm: number | null): number | null {
  if (!isUsable(plannedKm) || plannedKm === 0 || !isUsable(actualKm)) {
    return null;
  }
  return (actualKm - plannedKm) / plannedKm;
}

export function isSuspicious(plannedKm: number | null, actualKm: number | null): boolean {
  const ratio = deviationRatio(plannedKm, actualKm);
  if (ratio === null) {
    return false;
  }
  // Oran esikle karsilastirilmadan once yuvarlaniyor: 100 -> 110 sapmasi kayan
  // noktada 0.10000000000000142 cikiyor ve tam sinirdaki bir gorev, hesabin
  // hangi sirayla yapildigina gore bazen supheli bazen temiz gorunurdu.
  return round(ratio, 6) > SUSPICIOUS_DEVIATION_RATIO;
}

export interface DeviationTotals {
  assignments: number;
  /** Hesabi tamamlanabilen gorev sayisi — geri kalani veri eksikliginden disarida */
  computable: number;
  suspicious: number;
  totalDeviationKm: number;
  totalDeviationLiters: number;
  totalDeviationCostEur: number;
}

/**
 * Donem toplami.
 *
 * Negatif sapmalar (planlanandan kisa surulmus) toplamda DUSULUR, mutlak
 * deger alinmaz. Aksi halde rapor gercekte olmayan bir kayip gosterirdi:
 * bir gorevde 10 km fazla, digerinde 10 km az surulmusse net kayip sifirdir.
 */
export function sumDeviations(results: DeviationResult[]): DeviationTotals {
  let computable = 0;
  let totalKm = 0;
  let totalLiters = 0;
  let totalCost = 0;

  for (const result of results) {
    if (result.deviationKm === null) continue;
    computable += 1;
    totalKm += result.deviationKm;
    totalLiters += result.deviationLiters ?? 0;
    totalCost += result.deviationCostEur ?? 0;
  }

  return {
    assignments: results.length,
    computable,
    suspicious: 0,
    totalDeviationKm: round(totalKm, 2),
    totalDeviationLiters: round(totalLiters, 2),
    totalDeviationCostEur: round(totalCost, 2),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
