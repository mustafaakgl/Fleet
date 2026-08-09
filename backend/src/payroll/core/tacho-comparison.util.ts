import type { WorkInterval } from '../../work-time/core/work-time-fold.util';

/**
 * Surucunun bastigi mola ile takografin REST kaydinin karsilastirilmasi.
 *
 * TAKOGRAF BORDRONUN KAYNAGI DEGIL. Ana kayit surucunun kendi Zeiterfassung'u;
 * burasi yalnizca dogrulama uretiyor. Sebep: takograf araca bagli, surucu
 * karti okunmadiginda veya arac degistiginde bosluk birakiyor ve DDD dosyasi
 * haftalar sonra indirilebiliyor. Bordroyu ona baglamak, dosyasi gelmemis her
 * gunu sifir yapardi.
 *
 * IKI TUZAK bu modulun varlik sebebi:
 *
 * 1. Takograf gunluk dinlenmeyi (gece 11 saat) de REST yaziyor. Gunun tamamini
 *    molayla karsilastirmak her gunu devasa bir sapma gibi gosterirdi. Bu
 *    yuzden yalnizca VARDIYA PENCERESINE dusen REST sayiliyor.
 *
 * 2. Takograf verisi olmayan gun ile "dinlenme yok" gunu ayni sey degil.
 *    Ilkinde karsilastirma HIC YAPILMIYOR (null), sifir yazilmiyor.
 */

/** `available` (Bereitschaft) mola degildir: surucu emre amade bekliyor. */
export type TachoRestInterval = WorkInterval;

export type TachoComparison = {
  tachoRestMinutes: number;
  /** Takograf eksi surucu. Pozitif = takograf daha cok dinlenme gormus. */
  deltaMinutes: number;
  /** Fark toleransi asiyor mu — ekranda uyari bu. */
  mismatch: boolean;
};

/**
 * Araliklarin kesisimi. Takograf REST bloklari vardiyadan once baslayip sonra
 * bitebiliyor; yalnizca ortak kisim mola sayilabilir.
 */
export function intersectIntervals(
  intervals: readonly WorkInterval[],
  window: WorkInterval,
): WorkInterval[] {
  const windowStart = window.from.getTime();
  const windowEnd = window.to.getTime();
  if (!(windowEnd > windowStart)) return [];

  const result: WorkInterval[] = [];
  for (const interval of intervals) {
    const from = Math.max(interval.from.getTime(), windowStart);
    const to = Math.min(interval.to.getTime(), windowEnd);
    if (to > from) {
      result.push({ from: new Date(from), to: new Date(to) });
    }
  }
  return result;
}

/**
 * Gun bazinda karsilastirma.
 *
 * `tachoRestByDate` yalnizca takograf verisi OLAN gunleri icermeli; eksik gun
 * icin `null` donuyor ve cagiran bunu "karsilastirilamadi" olarak saklamali.
 * Ayrica surucunun o gun hic calismadigi gunde de karsilastirma yapilmiyor:
 * vardiya yoksa kiyaslanacak bir mola da yok.
 */
export function compareBreakWithTacho(params: {
  driverBreakMinutes: number;
  workedMinutes: number;
  tachoRestMinutes: number | undefined;
  toleranceMinutes: number;
}): TachoComparison | null {
  if (params.tachoRestMinutes === undefined) return null;
  if (params.workedMinutes <= 0) return null;

  const delta = params.tachoRestMinutes - params.driverBreakMinutes;
  return {
    tachoRestMinutes: params.tachoRestMinutes,
    deltaMinutes: delta,
    // Tolerans iki yone de bakiyor: surucunun fazla mola yazmasi da eksik
    // yazmasi kadar incelenmeli.
    mismatch: Math.abs(delta) > Math.max(0, params.toleranceMinutes),
  };
}

export const TACHO_BREAK_MISMATCH_ANOMALY = 'tacho_break_mismatch';
