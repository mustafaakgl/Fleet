import { Prisma } from '@prisma/client';
import {
  FUEL_LEVEL_SAMPLE_CAPTURE,
  FUEL_RECONCILIATION_THRESHOLDS,
} from './fuel-reconciliation-config';
import type { FuelLevelSampleInput } from './fuel-reconciliation.types';

export interface FuelLevelWindow {
  /** Pencerede kullanilabilir sayilan ornekler (kronolojik). */
  usable: FuelLevelSampleInput[];
  samplesBefore: number;
  samplesAfter: number;
  droppedFuture: number;
  droppedDuplicate: number;
  /** Artistan ONCEKI en dusuk seviye — olcumun tabani. */
  baseline: FuelLevelSampleInput | null;
  /** Tabandan SONRAKI en yuksek seviye — dolumun tepesi. */
  peak: FuelLevelSampleInput | null;
  /** peak - baseline (puan). Iki uc da yoksa null. */
  observedIncreasePct: Prisma.Decimal | null;
}

/**
 * Fis zamani etrafindaki yakit seviyesi olcumunu cikarir.
 *
 * NEDEN "en dusuk once / en yuksek sonra": fis, pompanin BITTIGI anda degil
 * kasada odendigi anda basiliyor. Dolum fisin damgasindan once bitmis
 * olabilir. Sadece "fisten hemen onceki" ve "hemen sonraki" ornege bakan bir
 * olcum, dolumun tamamini kacirir ve "artis yok" derdi.
 *
 * SONRA en az bir ornek SART: yalnizca fisten onceki bir yukselis, o dolumun
 * bu fise ait oldugunu kanitlamaz. Bir taraf bossa olcum yapilmis sayilmaz.
 */
export function selectFuelLevelWindow(
  samples: FuelLevelSampleInput[],
  receiptAt: Date,
  now: Date,
): FuelLevelWindow {
  const windowStart =
    receiptAt.getTime() - FUEL_RECONCILIATION_THRESHOLDS.levelWindowBeforeMinutes * 60_000;
  const windowEnd =
    receiptAt.getTime() + FUEL_RECONCILIATION_THRESHOLDS.levelWindowAfterMinutes * 60_000;
  const futureLimit = now.getTime() + FUEL_LEVEL_SAMPLE_CAPTURE.maxClockSkewMs;

  let droppedFuture = 0;
  let droppedDuplicate = 0;

  // Cihaz saati ileri kaymis kayitlar OLCUM DEGILDIR: "gelecekte" bir dolum
  // gorunmesi, sensor degil saat sorunudur.
  const dated = samples.filter((sample) => {
    if (sample.recordedAt.getTime() > futureLimit) {
      droppedFuture += 1;
      return false;
    }
    return true;
  });

  // Paketler sirasiz gelebilir; olcum sirasi CIHAZ zamanina gore kurulur.
  const sorted = [...dated].sort(
    (left, right) => left.recordedAt.getTime() - right.recordedAt.getTime(),
  );

  const usable: FuelLevelSampleInput[] = [];
  let previousMs: number | null = null;
  for (const sample of sorted) {
    const ms = sample.recordedAt.getTime();
    // Ayni cihaz zamani iki kez geldiyse ikincisi tekrar gonderimdir; ikinci
    // satiri saymak sahte bir "degisim" uretirdi.
    if (previousMs !== null && ms === previousMs) {
      droppedDuplicate += 1;
      continue;
    }
    previousMs = ms;
    if (ms < windowStart || ms > windowEnd) {
      continue;
    }
    usable.push(sample);
  }

  const receiptMs = receiptAt.getTime();
  const beforeSamples = usable.filter((sample) => sample.recordedAt.getTime() <= receiptMs);
  const afterSamples = usable.filter((sample) => sample.recordedAt.getTime() > receiptMs);

  let baseline: FuelLevelSampleInput | null = null;
  for (const sample of beforeSamples) {
    if (!baseline || sample.fuelLevelPct.lessThanOrEqualTo(baseline.fuelLevelPct)) {
      baseline = sample;
    }
  }

  let peak: FuelLevelSampleInput | null = null;
  if (baseline) {
    const baselineMs = baseline.recordedAt.getTime();
    for (const sample of usable) {
      if (sample.recordedAt.getTime() < baselineMs) {
        continue;
      }
      if (!peak || sample.fuelLevelPct.greaterThan(peak.fuelLevelPct)) {
        peak = sample;
      }
    }
  }

  const measurable = baseline !== null && peak !== null && afterSamples.length > 0;

  return {
    usable,
    samplesBefore: beforeSamples.length,
    samplesAfter: afterSamples.length,
    droppedFuture,
    droppedDuplicate,
    baseline: measurable ? baseline : null,
    peak: measurable ? peak : null,
    observedIncreasePct:
      measurable && baseline && peak
        ? Prisma.Decimal.max(peak.fuelLevelPct.minus(baseline.fuelLevelPct), new Prisma.Decimal(0))
        : null,
  };
}
