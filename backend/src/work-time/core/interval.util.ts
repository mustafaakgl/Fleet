import type { WorkInterval } from './work-time-fold.util';

/**
 * Aralik aritmetigi.
 *
 * `work-time/core` altinda cunku hem Zeiterfassung hem bordro bunu kullaniyor
 * ve bagimlilik yonu bu yonde: payroll work-time'i taniyor, tersi degil.
 * Onceden `payroll/core/tacho-comparison.util.ts` icindeydi ve mola adayi
 * uretimi de ayni islemi isteyince oradan import etmek gerekecekti — yani
 * Zeiterfassung bordroya bagimli hale gelecekti.
 */

/** Bos ve ters araliklari eler; `to > from` olmayan hicbir sey donmez. */
function isPositive(interval: WorkInterval): boolean {
  return interval.to.getTime() > interval.from.getTime();
}

function byStart(left: WorkInterval, right: WorkInterval): number {
  return left.from.getTime() - right.from.getTime();
}

/**
 * Araliklarin pencereyle kesisimi.
 *
 * Takograf REST bloklari vardiyadan once baslayip sonra bitebiliyor; yalnizca
 * ortak kisim mola sayilabilir.
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
 * Ust uste binen veya `gapMs` kadar yakin araliklari tek parca yapar.
 *
 * Takograf gerekli: DDD dosyasi ayni dinlenmeyi ardisik birden fazla activity
 * kaydi olarak tasiyabiliyor (kayit siniri, arac degisimi, dakika yuvarlamasi).
 * Birlestirmeden esik uygulanirsa 8+8 dakikalik tek bir 16 dakikalik dinlenme
 * iki kez elenirdi.
 */
export function mergeIntervals(
  intervals: readonly WorkInterval[],
  gapMs = 60_000,
): WorkInterval[] {
  const sorted = intervals.filter(isPositive).slice().sort(byStart);
  const merged: WorkInterval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.from.getTime() - last.to.getTime() <= gapMs) {
      if (interval.to.getTime() > last.to.getTime()) {
        merged[merged.length - 1] = { from: last.from, to: interval.to };
      }
      continue;
    }
    merged.push({ from: interval.from, to: interval.to });
  }

  return merged;
}

/**
 * `intervals` eksi `cuts`. Kesilen yerlerde aralik ikiye bolunebilir.
 *
 * Mola adayi uretiminin kalbi: takografin gordugu dinlenmeden surucunun ZATEN
 * kaydettigi mola cikarilinca geriye "kaydedilmemis" kisim kalir. Tam ortusen
 * dinlenme geriye hicbir sey birakmaz ve aday uretilmez.
 */
export function subtractIntervals(
  intervals: readonly WorkInterval[],
  cuts: readonly WorkInterval[],
): WorkInterval[] {
  const blockers = mergeIntervals(cuts, 0);
  const result: WorkInterval[] = [];

  for (const interval of intervals) {
    let segments: WorkInterval[] = [interval];

    for (const cut of blockers) {
      const next: WorkInterval[] = [];
      for (const segment of segments) {
        const segFrom = segment.from.getTime();
        const segTo = segment.to.getTime();
        const cutFrom = cut.from.getTime();
        const cutTo = cut.to.getTime();

        if (cutTo <= segFrom || cutFrom >= segTo) {
          next.push(segment);
          continue;
        }
        if (cutFrom > segFrom) {
          next.push({ from: new Date(segFrom), to: new Date(cutFrom) });
        }
        if (cutTo < segTo) {
          next.push({ from: new Date(cutTo), to: new Date(segTo) });
        }
      }
      segments = next;
      if (segments.length === 0) break;
    }

    result.push(...segments.filter(isPositive));
  }

  return result.sort(byStart);
}
