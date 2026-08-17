import type {
  CostDashboardMonthPoint,
  CostDashboardResponse,
  CostDashboardVehicleRow,
  MetricComparison,
} from '@/lib/types';

/**
 * Maliyet dashboard'unun SAF gorunum mantigi.
 *
 * TUTARLARIN GERCEK KAYNAGI STRING'DIR. Buradaki `number`'a cevirme YALNIZCA
 * grafik icin: recharts sayi ister. Muhasebe tablosu ve toplamlar string
 * degeri gosterir — float'a cevirip geri yazmak 0,1 + 0,2 sorununu muhasebe
 * ekranina tasirdi.
 */

/**
 * Grafik icin guvenli sayi.
 *
 * Ayristirilamayan ya da sonlu olmayan deger 0 DEGIL null doner: 0 "bu ay
 * maliyet yoktu" demek, null ise "deger okunamadi" — grafikte ikisi ayni
 * gorunmemeli.
 */
export function toChartNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Grafik serisi — eksik deger 0'a DEGIL, kendi anlamina cevriliyor. */
export interface MonthlyChartPoint {
  bucket: string;
  fuel: number;
  service: number;
  fines: number;
  total: number;
}

export function toMonthlyChartData(
  series: readonly CostDashboardMonthPoint[],
): MonthlyChartPoint[] {
  return series.map((point) => ({
    bucket: point.bucket,
    // Bos ay GERCEKTEN sifirdir (backend sifir gonderiyor); okunamayan deger
    // de grafikte sifir gorunur ama tablo string'i olduğu gibi gosterir.
    fuel: toChartNumber(point.fuel) ?? 0,
    service: toChartNumber(point.service) ?? 0,
    fines: toChartNumber(point.fines) ?? 0,
    total: toChartNumber(point.total) ?? 0,
  }));
}

export interface CompositionSlice {
  key: 'fuel' | 'service' | 'fines';
  value: number;
  /** Toplamdaki payi — toplam sifirsa null, sahte %0 gosterilmiyor. */
  percent: number | null;
}

/**
 * Maliyet dagilimi.
 *
 * ALTIDAN FAZLA DILIM URETILMEZ ve toplama katilmayan kategori EKLENMEZ:
 * pasta grafigi ancak parcalari gercekten bir butunu olusturuyorsa okunur.
 * Bekleyen fisler ve donusturulmemis tutarlar bu yuzden burada YOK.
 */
export function toComposition(
  composition: CostDashboardResponse['composition'],
): CompositionSlice[] {
  const total = toChartNumber(composition.total) ?? 0;
  const slices: CompositionSlice[] = (['fuel', 'service', 'fines'] as const).map((key) => {
    const value = toChartNumber(composition[key]) ?? 0;
    return { key, value, percent: total > 0 ? (value / total) * 100 : null };
  });

  // Sifir kategoriler gizlenmiyor: "servis maliyeti yok" da bir bilgidir ve
  // legend'da yerini korumali.
  return slices;
}

/** Aracin grafikteki kirilimi. */
export function toVehicleChartData(rows: readonly CostDashboardVehicleRow[]) {
  return rows.map((row) => ({
    vehicleId: row.vehicleId,
    plateNumber: row.plateNumber,
    fuel: toChartNumber(row.fuel) ?? 0,
    service: toChartNumber(row.service) ?? 0,
    fines: toChartNumber(row.fines) ?? 0,
    total: toChartNumber(row.total) ?? 0,
  }));
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown';

export function trendDirection(metric: MetricComparison | null | undefined): TrendDirection {
  if (!metric) return 'unknown';
  const change = toChartNumber(metric.absoluteChange);
  if (change === null) return 'unknown';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/**
 * Degisimin IYI mi KOTU mu oldugu.
 *
 * Tek bir renk kurali butun KPI'lara korlemesine uygulanamaz: maliyetin
 * artmasi kotu, GELIRIN artmasi iyidir. Ayni yesil ok iki karta konsaydi
 * ekran yaniltici olurdu.
 */
export type MetricPolarity = 'cost' | 'income';

export function changeSentiment(
  direction: TrendDirection,
  polarity: MetricPolarity,
): 'good' | 'bad' | 'neutral' {
  if (direction === 'flat') return 'neutral';
  if (direction === 'unknown') return 'neutral';
  const rising = direction === 'up';
  return polarity === 'cost' ? (rising ? 'bad' : 'good') : rising ? 'good' : 'bad';
}

/** Para bicimi — sembol HARD-CODE EDILMEZ, baseCurrency'den gelir. */
export function formatMoney(value: string | number | null, currency: string, locale: string): string {
  const amount = typeof value === 'number' ? value : toChartNumber(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

/** Maliyet/km. Deger yoksa "yetersiz veri" — `0` GOSTERILMEZ. */
export function formatCostPerKm(
  value: string | null,
  currency: string,
  locale: string,
): string | null {
  const amount = toChartNumber(value);
  if (amount === null) return null;
  return `${new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)}/km`;
}

export function formatPercent(value: string | null, locale: string): string | null {
  const parsed = toChartNumber(value);
  if (parsed === null) return null;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(parsed / 100);
}

/**
 * Deterministik notlar — AI DEGIL, sayilabilir gerceklerden.
 *
 * Korelasyon neden-sonuc gibi SUNULMAZ: "en pahali arac" bir siralama
 * gercegidir, bir teshis degil.
 */
export interface CostInsight {
  key: string;
  /** Tiklaninca uygulanacak filtre — insight bir cikmaz sokak olmamali. */
  vehicleId?: string;
  params?: Record<string, string | number>;
}

export function buildInsights(data: CostDashboardResponse | null): CostInsight[] {
  if (!data) return [];
  const insights: CostInsight[] = [];

  const ranked = data.vehicleRanking;
  const mostExpensive = ranked[0];
  if (mostExpensive && (toChartNumber(mostExpensive.total) ?? 0) > 0) {
    insights.push({
      key: 'mostExpensiveVehicle',
      vehicleId: mostExpensive.vehicleId,
      params: { plate: mostExpensive.plateNumber },
    });
  }

  // Cost/km yalnizca YETERLI mesafe verisi olan araclar arasinda.
  const withPerKm = ranked.filter((row) => row.costPerKm !== null);
  if (withPerKm.length > 0) {
    const worst = withPerKm.reduce((acc, row) =>
      (toChartNumber(row.costPerKm) ?? 0) > (toChartNumber(acc.costPerKm) ?? 0) ? row : acc,
    );
    insights.push({
      key: 'highestCostPerKm',
      vehicleId: worst.vehicleId,
      params: { plate: worst.plateNumber },
    });
  }

  // Onceki donem sifirsa yuzde YOK, dolayisiyla "en cok artan" da uretilmiyor.
  const withChange = ranked.filter((row) => row.changePercent !== null);
  if (withChange.length > 0) {
    const biggest = withChange.reduce((acc, row) =>
      (toChartNumber(row.changePercent) ?? 0) > (toChartNumber(acc.changePercent) ?? 0) ? row : acc,
    );
    if ((toChartNumber(biggest.changePercent) ?? 0) > 0) {
      insights.push({
        key: 'biggestIncrease',
        vehicleId: biggest.vehicleId,
        params: { plate: biggest.plateNumber, percent: biggest.changePercent ?? '' },
      });
    }
  }

  const composition = toComposition(data.composition);
  const largest = composition.reduce((acc, slice) => (slice.value > acc.value ? slice : acc));
  if (largest.value > 0) {
    insights.push({ key: `largestCategory.${largest.key}`, params: {} });
  }

  if (data.summary.pendingReceiptCount > 0) {
    insights.push({
      key: 'pendingReceipts',
      params: { count: data.summary.pendingReceiptCount },
    });
  }

  // Eksik veri GIZLENMIYOR.
  if (data.dataQuality.vehiclesWithoutDistance > 0) {
    insights.push({
      key: 'missingDistance',
      params: { count: data.dataQuality.vehiclesWithoutDistance },
    });
  }
  if (data.dataQuality.excludedUnconvertedEntries > 0) {
    insights.push({
      key: 'unconvertedEntries',
      params: { count: data.dataQuality.excludedUnconvertedEntries },
    });
  }

  return insights;
}

/** Backend hata kodu -> ceviri anahtari. HAM KOD GOSTERILMEZ. */
export function costDashboardErrorKey(code: string | null | undefined): string {
  switch (code) {
    case 'cost_dashboard_reversed_range':
      return 'costs.dashboard.errors.reversedRange';
    case 'cost_dashboard_range_in_future':
      return 'costs.dashboard.errors.futureRange';
    case 'cost_dashboard_range_too_large':
      return 'costs.dashboard.errors.rangeTooLarge';
    case 'cost_dashboard_invalid_range':
      return 'costs.dashboard.errors.invalidRange';
    default:
      return 'costs.dashboard.errors.generic';
  }
}

/**
 * Kategori renkleri — dashboard genelinde AYNI.
 *
 * Renk TEK BASINA bilgi tasimiyor: her yerde legend/etiket eslik ediyor,
 * boylece renk korlugunde de kategoriler ayirt edilebiliyor.
 */
export const CATEGORY_COLORS = {
  fuel: '#f59e0b',
  service: '#2563eb',
  fines: '#dc2626',
  other: '#94a3b8',
  revenue: '#16a34a',
} as const;
