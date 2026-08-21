import { Prisma } from '@prisma/client';

/**
 * Maliyet dashboard'unun SAF mantigi.
 *
 * Saf tutuluyor cunku buradaki her karar bir yonetim ekranina rakam basiyor:
 * yanlis bir donem siniri bir ayin maliyetini iki kez sayar, yanlis bir yuzde
 * "maliyet %900 artti" gibi bir panik uretir. Hepsi veritabani olmadan
 * sinanabilmeli.
 *
 * PARA MATEMATIGI DECIMAL ILE: `number` ile toplamak 0,1 + 0,2 =
 * 0,30000000000000004'u muhasebe ekranina dusurur.
 */

/**
 * Kiracida zaman dilimi cozulemezse kullanilan VARSAYILAN.
 *
 * Artik bir SABIT DEGIL, yalnizca yedek: gercek deger `Tenant.timezone`dan
 * geliyor (bkz. CostDashboardService). Almanya'da baslayan urun icin
 * varsayilanin Berlin olmasi dogru, ama Istanbul kiracisi kendi ayini
 * gormeli.
 */
export const FLEET_TIME_ZONE = 'Europe/Berlin';

/** Hazir donem secenekleri (ay). */
export const PERIOD_MONTH_OPTIONS = [1, 3, 6, 12] as const;
export const DEFAULT_PERIOD_MONTHS = 6;

/**
 * Sorgulanabilir en uzun aralik.
 *
 * Sinirsiz gecmis sorgusu acmak, tek bir istekle butun filo gecmisini tarayan
 * bir uc demek olurdu. 36 ay uc yillik karsilastirmaya yeter ve karsilastirma
 * donemiyle birlikte en fazla alti yil geriye gider.
 */
export const MAX_RANGE_DAYS = 366 * 3;

export const ZERO = new Prisma.Decimal(0);

/** Para degeri -> sabit iki haneli metin. Response'ta tutarlar STRING. */
export function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** Mesafe -> uc haneli metin; null ise null (0 ile KARISTIRILMAZ). */
export function distance(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(3);
}

export interface MetricComparison {
  current: string;
  previous: string;
  absoluteChange: string;
  /** Onceki donem sifirsa null — sahte yuzde URETILMEZ. */
  percentChange: string | null;
}

/**
 * Iki donemi karsilastirir.
 *
 * `percentChange` onceki deger SIFIRSA null: "0'dan 500'e" degisim matematiksel
 * olarak sonsuzdur ve `Infinity`, `9999%` ya da `100%` yazmak kullaniciyi
 * yanlis bir buyuklukle karar vermeye iter. Arayuz null'i "onceki donemde veri
 * yok" diye gosteriyor.
 */
export function compare(current: Prisma.Decimal, previous: Prisma.Decimal): MetricComparison {
  const absolute = current.minus(previous);
  const percent = previous.isZero()
    ? null
    : absolute.dividedBy(previous).times(100).toFixed(1);

  return {
    current: money(current),
    previous: money(previous),
    absoluteChange: money(absolute),
    percentChange: percent,
  };
}

/** Mesafe icin karsilastirma — para degil, uc haneli. */
export function compareDistance(
  current: Prisma.Decimal | null,
  previous: Prisma.Decimal | null,
): MetricComparison | null {
  if (current === null && previous === null) {
    return null;
  }
  const cur = current ?? ZERO;
  const prev = previous ?? ZERO;
  const absolute = cur.minus(prev);
  return {
    current: cur.toFixed(3),
    previous: prev.toFixed(3),
    absoluteChange: absolute.toFixed(3),
    percentChange: prev.isZero() ? null : absolute.dividedBy(prev).times(100).toFixed(1),
  };
}

/**
 * Maliyet / km.
 *
 * Mesafe yoksa, sifirsa ya da negatifse ORAN HESAPLANMAZ — `0 €/km` gostermek
 * "bu arac bedava calisiyor" demek olur, oysa gercek "mesafe verisi yok".
 * Arayuz null'i "Yetersiz mesafe verisi" diye gosteriyor.
 */
export function costPerKm(
  totalCost: Prisma.Decimal,
  distanceKm: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (distanceKm === null || distanceKm.lessThanOrEqualTo(0)) {
    return null;
  }
  return totalCost.dividedBy(distanceKm);
}

/** Ay kovasi: `YYYY-MM`. */
export interface MonthBucket {
  key: string;
  start: Date;
  /** Bir sonraki ayin baslangici — ust sinir HARIC. */
  end: Date;
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  };
}

/** Bir anin verilen zaman dilimindeki UTC ofseti (ms). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/**
 * Yerel ay basinin UTC ani.
 *
 * Iki adimda cozuluyor: ilk tahmin o anin ofsetiyle, sonra duzeltilmis anin
 * KENDI ofsetiyle. Tek adim, yaz saatine gecilen aylarda bir saat kayardi ve
 * ay sinirindaki kayitlar yanlis kovaya duserdi.
 */
export function zonedMonthStart(
  year: number,
  month: number,
  timeZone: string = FLEET_TIME_ZONE,
): Date {
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/**
 * Araligi AY kovalarina boler.
 *
 * BOS AYLAR DA URETILIYOR: grafikte eksik ay, "o ay maliyet yoktu" bilgisini
 * gizler ve seriyi yaniltici sekilde kisaltir. Cagiran taraf her kovaya sifir
 * yaziyor.
 */
export function monthBuckets(
  from: Date,
  to: Date,
  timeZone: string = FLEET_TIME_ZONE,
): MonthBucket[] {
  const first = zonedParts(from, timeZone);
  const last = zonedParts(to, timeZone);

  const buckets: MonthBucket[] = [];
  let year = first.year;
  let month = first.month;

  // Ust sinir DAHIL: `to` ayin ortasindaysa o ay da gorunmeli.
  while (year < last.year || (year === last.year && month <= last.month)) {
    const start = zonedMonthStart(year, month, timeZone);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    buckets.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      start,
      end: zonedMonthStart(nextYear, nextMonth, timeZone),
    });
    year = nextYear;
    month = nextMonth;
  }

  return buckets;
}

/** Bir anin ait oldugu ay kovasinin anahtari. */
export function bucketKeyFor(instant: Date, timeZone: string = FLEET_TIME_ZONE): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

export interface ResolvedPeriod {
  from: Date;
  to: Date;
  comparisonFrom: Date;
  comparisonTo: Date;
}

export type PeriodError =
  | 'invalid_range'
  | 'reversed_range'
  | 'range_in_future'
  | 'range_too_large';

/**
 * Donemi ve KARSILASTIRMA donemini cozer.
 *
 * Karsilastirma donemi, secilen araligin TAM UZUNLUGUNDA ve hemen oncesi.
 * Sinirlar CAKISMIYOR: `comparisonTo` = `from` (ust sinir haric), yoksa sinir
 * gunundeki kayitlar iki donemde birden sayilirdi.
 */
export function resolvePeriod(
  input: { from?: string; to?: string; months?: number },
  now: Date = new Date(),
  timeZone: string = FLEET_TIME_ZONE,
): { ok: true; period: ResolvedPeriod } | { ok: false; error: PeriodError } {
  let to: Date;
  let from: Date;

  if (input.from || input.to) {
    from = new Date(input.from ?? '');
    to = new Date(input.to ?? '');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: 'invalid_range' };
    }
    if (to.getTime() < from.getTime()) {
      return { ok: false, error: 'reversed_range' };
    }
  } else {
    const months = input.months ?? DEFAULT_PERIOD_MONTHS;
    to = now;
    // Donem basi KIRACININ zaman diliminde: sabit bolge kullanmak Istanbul
    // kiracisinin ay sinirini kaydirirdi.
    const p = zonedParts(now, timeZone);
    from = zonedMonthStart(p.year, p.month - (months - 1), timeZone);
  }

  // Gelecege sorgu ANLAMSIZ: henuz olmamis bir donemin maliyeti yok ve
  // kullanici bunu bos grafik yerine acik bir hata olarak gormeli.
  if (from.getTime() > now.getTime()) {
    return { ok: false, error: 'range_in_future' };
  }

  const spanMs = to.getTime() - from.getTime();
  if (spanMs > MAX_RANGE_DAYS * 86_400_000) {
    return { ok: false, error: 'range_too_large' };
  }

  return {
    ok: true,
    period: {
      from,
      to,
      // Cakismayan sinir: onceki donem tam olarak `from`da biter.
      comparisonFrom: new Date(from.getTime() - spanMs),
      comparisonTo: from,
    },
  };
}

/**
 * Filo genelinde maliyet/km.
 *
 * TOPLAM maliyet / TOPLAM gecerli mesafe. Arac ortalamalarinin basit
 * ortalamasi ALINMIYOR: 10 km giden pahali bir arac ile 10.000 km giden ucuz
 * bir aracin oranlarini esit agirlikla ortalamak, filonun gercek birim
 * maliyetini tamamen carpitir.
 */
export interface CostPerKmCoverage {
  includedVehicleCount: number;
  excludedVehicleCount: number;
  includedDistanceKm: string;
  includedCost: string;
  totalFleetCost: string;
  /** Oranin filo maliyetinin YUZDE KACINI temsil ettigi. */
  costCoveragePercent: string | null;
}

/**
 * Maliyet/km'nin HANGI VERI KUMESI uzerinden hesaplandigi.
 *
 * Bu oran mesafesi olmayan araclarin maliyetini de disarida birakiyor — yani
 * filonun TAMAMINI temsil etmiyor. Bu ancak ACIKCA soylenirse durustur:
 * "0,06 EUR/km" rakami, filonun yarisinin disarida kaldigi bir kumeden
 * geliyorsa yonetimi yanlis bir kesinlige ikna eder.
 */
export function costPerKmCoverage(
  rows: ReadonlyArray<{ total: Prisma.Decimal; distanceKm: Prisma.Decimal | null }>,
): CostPerKmCoverage {
  let includedCost = ZERO;
  let includedKm = ZERO;
  let totalCost = ZERO;
  let included = 0;
  let excluded = 0;

  for (const row of rows) {
    totalCost = totalCost.plus(row.total);
    if (row.distanceKm === null || row.distanceKm.lessThanOrEqualTo(0)) {
      excluded += 1;
      continue;
    }
    included += 1;
    includedCost = includedCost.plus(row.total);
    includedKm = includedKm.plus(row.distanceKm);
  }

  return {
    includedVehicleCount: included,
    excludedVehicleCount: excluded,
    includedDistanceKm: includedKm.toFixed(3),
    includedCost: money(includedCost),
    totalFleetCost: money(totalCost),
    // Filo maliyeti sifirsa yuzde ANLAMSIZ — sahte %100 uretilmiyor.
    costCoveragePercent: totalCost.isZero()
      ? null
      : includedCost.dividedBy(totalCost).times(100).toFixed(1),
  };
}

export function fleetCostPerKm(
  rows: ReadonlyArray<{ total: Prisma.Decimal; distanceKm: Prisma.Decimal | null }>,
): Prisma.Decimal | null {
  let cost = ZERO;
  let km = ZERO;

  for (const row of rows) {
    // Mesafesi bilinmeyen aracin MALIYETI de paya girmiyor: aksi halde pay
    // buyur, payda buyumez ve oran sistematik olarak sisirilir.
    if (row.distanceKm === null || row.distanceKm.lessThanOrEqualTo(0)) continue;
    cost = cost.plus(row.total);
    km = km.plus(row.distanceKm);
  }

  return km.isZero() ? null : cost.dividedBy(km);
}

export type VehicleSortKey = 'total' | 'costPerKm' | 'margin' | 'change';

export interface RankableVehicle {
  vehicleId: string;
  plateNumber: string;
  total: Prisma.Decimal;
  costPerKm: Prisma.Decimal | null;
  margin: Prisma.Decimal | null;
  changePercent: Prisma.Decimal | null;
}

/**
 * Arac siralamasi — DETERMINISTIK.
 *
 * Esitlikte `plateNumber`, sonra `vehicleId` ile kirilir: aksi halde ayni
 * maliyetli iki arac her yenilemede yer degistirir ve sayfalamada biri hic
 * gorunmeyebilir.
 *
 * Olcutu OLMAYAN arac her zaman SONA gider (siralama yonunden bagimsiz):
 * "veri yok" en iyi ya da en kotu degildir, siralanamaz.
 */
export function sortVehicles<T extends RankableVehicle>(rows: T[], key: VehicleSortKey): T[] {
  const valueOf = (row: T): Prisma.Decimal | null => {
    switch (key) {
      case 'costPerKm':
        return row.costPerKm;
      case 'margin':
        return row.margin;
      case 'change':
        return row.changePercent;
      default:
        return row.total;
    }
  };

  return [...rows].sort((left, right) => {
    const a = valueOf(left);
    const b = valueOf(right);

    if (a === null && b === null) return tieBreak(left, right);
    if (a === null) return 1;
    if (b === null) return -1;

    const diff = b.comparedTo(a);
    return diff !== 0 ? diff : tieBreak(left, right);
  });
}

function tieBreak(left: RankableVehicle, right: RankableVehicle): number {
  const byPlate = left.plateNumber.localeCompare(right.plateNumber);
  return byPlate !== 0 ? byPlate : left.vehicleId.localeCompare(right.vehicleId);
}

/**
 * Aracin verisindeki eksiklikler — arayuz bunu isaretliyor.
 *
 * `no_revenue` bayragi IKIYE AYRILDI (Faz 18B): "gelir yok" tek basina
 * anlamsizdi, cunku gorev tahmini ile kesilmis fatura ayni bayraga
 * dusuyordu. Tahmini olan ama faturasi olmayan bir arac "gelirli" gorunuyor
 * ve marji tahmin uzerinden hesaplaniyordu.
 */
export function dataQualityFlags(input: {
  distanceKm: Prisma.Decimal | null;
  total: Prisma.Decimal;
  hasEstimatedRevenue: boolean;
  hasActualRevenue: boolean;
}): string[] {
  const flags: string[] = [];
  if (input.distanceKm === null || input.distanceKm.lessThanOrEqualTo(0)) {
    flags.push('no_distance');
  }
  if (input.total.isZero()) {
    flags.push('no_costs');
  }
  if (!input.hasEstimatedRevenue) {
    flags.push('no_estimated_revenue');
  }
  if (!input.hasActualRevenue) {
    // Marj bu araclarda hesaplanMIYOR — bayrak, bos marj hucresinin NEDENI.
    flags.push('no_actual_revenue');
  }
  return flags;
}
