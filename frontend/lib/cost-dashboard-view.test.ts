import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  changeSentiment,
  costDashboardErrorKey,
  formatCostPerKm,
  formatMoney,
  formatPercent,
  toChartNumber,
  toComposition,
  toMonthlyChartData,
  toTrendSeries,
  trendDirection,
  buildCostDashboardCsv,
  costDashboardCsvName,
  escapeCsvCell,
  formatCoveragePercent,
  formatTrendValue,
  isCoverageLow,
  isTrendMetricAvailable,
} from './cost-dashboard-view';
import type { CostDashboardResponse } from './types';

function metric(current: string, previous: string, percent: string | null) {
  return { current, previous, absoluteChange: String(Number(current) - Number(previous)), percentChange: percent };
}

function response(overrides: Partial<CostDashboardResponse> = {}): CostDashboardResponse {
  return {
    baseCurrency: 'EUR',
    period: { from: '2026-05-01T00:00:00Z', to: '2026-08-01T00:00:00Z', timezone: 'Europe/Berlin' },
    comparisonPeriod: { from: '2026-02-01T00:00:00Z', to: '2026-05-01T00:00:00Z' },
    summary: {
      totalCost: metric('1200.00', '1000.00', '20.0'),
      fuelCost: metric('700.00', '600.00', '16.7'),
      serviceCost: metric('400.00', '300.00', '33.3'),
      fineCost: metric('100.00', '100.00', '0.0'),
      revenue: metric('5000.00', '4000.00', '25.0'),
      margin: metric('3800.00', '3000.00', '26.7'),
      costPerKm: metric('0.5000', '0.4000', '25.0'),
      distanceKm: metric('2400.000', '2500.000', '-4.0'),
      pendingReceiptCount: 2,
      pendingServiceCost: '0.00',
      pendingServiceCount: 0,
      disputedFineCost: '0.00',
      disputedFineCount: 0,
    },
    monthlySeries: [
      { bucket: '2026-05', label: '2026-05', fuel: '0.00', service: '0.00', fines: '0.00', total: '0.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: null, actualRevenue: null, distanceKm: null, costPerKm: null },
      { bucket: '2026-06', label: '2026-06', fuel: '700.00', service: '400.00', fines: '100.00', total: '1200.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: '5000.00', actualRevenue: '4200.00', distanceKm: '2400.000', costPerKm: '0.5000' },
    ],
    composition: { fuel: '700.00', service: '400.00', fines: '100.00', total: '1200.00' },
    excludedFromTotals: { pendingService: '0.00', pendingServiceCount: 0, disputedFines: '0.00', disputedFineCount: 0, pendingReceiptCount: 2 },
    vehicleRanking: [
      { vehicleId: 'v1', plateNumber: 'AA-1', displayName: 'MAN TGX', fuel: '700.00', service: '300.00', fines: '0.00', total: '1000.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: '4000.00', actualRevenue: '4000.00', margin: '3000.00', distanceKm: '2000.000', costPerKm: '0.5000', previousTotal: '800.00', changePercent: '25.0', dataQuality: [] },
      { vehicleId: 'v2', plateNumber: 'BB-2', displayName: null, fuel: '0.00', service: '100.00', fines: '100.00', total: '200.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: null, actualRevenue: null, margin: null, distanceKm: null, costPerKm: null, previousTotal: '0.00', changePercent: null, dataQuality: ['no_distance', 'no_actual_revenue'] },
    ],
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    unconvertedByCurrency: [],
    dataQuality: { vehiclesWithoutDistance: 1, vehiclesWithoutCosts: 0, excludedUnconvertedEntries: 0, notes: [] },
    ...overrides,
  } as CostDashboardResponse;
}

describe('toChartNumber', () => {
  it('parses a decimal string', () => {
    expect(toChartNumber('1200.50')).toBe(1200.5);
  });

  it('returns null rather than 0 for unreadable values', () => {
    // 0 "maliyet yoktu" demek; null "okunamadi" — grafikte ayni gorunmemeli.
    expect(toChartNumber(null)).toBeNull();
    expect(toChartNumber('abc')).toBeNull();
    expect(toChartNumber(undefined)).toBeNull();
  });
});

describe('monthly chart data', () => {
  it('keeps empty months visible with zero values', () => {
    const points = toMonthlyChartData(response().monthlySeries);
    expect(points).toHaveLength(2);
    // Bos ay ATLANMIYOR.
    expect(points[0]).toMatchObject({ bucket: '2026-05', total: 0 });
    expect(points[1]).toMatchObject({ bucket: '2026-06', fuel: 700, service: 400, fines: 100 });
  });

  it('keeps the stacked parts adding up to the total', () => {
    const point = toMonthlyChartData(response().monthlySeries)[1]!;
    expect(point.fuel + point.service + point.fines).toBe(point.total);
  });
});

describe('composition', () => {
  it('computes percentages that sum to 100', () => {
    const slices = toComposition(response().composition);
    const sum = slices.reduce((acc, slice) => acc + (slice.percent ?? 0), 0);
    expect(Math.round(sum)).toBe(100);
  });

  it('never invents a percentage when the total is zero', () => {
    const slices = toComposition({ fuel: '0.00', service: '0.00', fines: '0.00', total: '0.00' });
    expect(slices.every((slice) => slice.percent === null)).toBe(true);
  });

  it('produces at most the real cost categories', () => {
    const slices = toComposition(response().composition);
    // Alti dilimden fazlasi pasta grafigini okunmaz yapar.
    expect(slices.length).toBeLessThanOrEqual(6);
    expect(slices.map((s) => s.key)).toEqual(['fuel', 'service', 'fines']);
  });
});

describe('trend meaning', () => {
  it('detects direction from the absolute change', () => {
    expect(trendDirection(metric('1200', '1000', '20.0'))).toBe('up');
    expect(trendDirection(metric('800', '1000', '-20.0'))).toBe('down');
    expect(trendDirection(metric('1000', '1000', '0.0'))).toBe('flat');
    expect(trendDirection(null)).toBe('unknown');
  });

  it('reads a rising cost as bad but a rising income as good', () => {
    // Tek renk kurali korlemesine uygulanamaz.
    expect(changeSentiment('up', 'cost')).toBe('bad');
    expect(changeSentiment('up', 'income')).toBe('good');
    expect(changeSentiment('down', 'cost')).toBe('good');
    expect(changeSentiment('down', 'income')).toBe('bad');
    expect(changeSentiment('flat', 'cost')).toBe('neutral');
  });
});

describe('formatting', () => {
  it('formats EUR without hard-coding the symbol', () => {
    const out = formatMoney('1200.50', 'EUR', 'de-DE');
    expect(out).toContain('€');
    expect(out).toContain('1.200,50');
  });

  it('formats TRY for a Turkish tenant', () => {
    const out = formatMoney('1200.50', 'TRY', 'tr-TR');
    expect(out).toContain('₺');
    expect(out).not.toContain('€');
  });

  it('shows a dash instead of a fake zero for missing money', () => {
    expect(formatMoney(null, 'EUR', 'de-DE')).toBe('—');
  });

  it('returns null cost per km when there is no distance data', () => {
    // `0 €/km` GOSTERILMEZ; cagiran taraf "yetersiz veri" yazar.
    expect(formatCostPerKm(null, 'EUR', 'de-DE')).toBeNull();
    expect(formatCostPerKm('0.5000', 'EUR', 'de-DE')).toContain('/km');
  });

  it('signs the percent change explicitly', () => {
    expect(formatPercent('20.0', 'de-DE')).toContain('+');
    expect(formatPercent('-20.0', 'de-DE')).toContain('-');
    expect(formatPercent(null, 'de-DE')).toBeNull();
  });
});

describe('insights', () => {
  it('names the most expensive vehicle and links to it', () => {
    const insights = buildInsights(response());
    const top = insights.find((i) => i.key === 'mostExpensiveVehicle');
    expect(top?.vehicleId).toBe('v1');
    expect(top?.params?.plate).toBe('AA-1');
  });

  it('only ranks cost per km among vehicles that have distance', () => {
    const insights = buildInsights(response());
    const perKm = insights.find((i) => i.key === 'highestCostPerKm');
    // v2'nin mesafesi yok — cost/km sıralamasına GIRMEZ.
    expect(perKm?.vehicleId).toBe('v1');
  });

  it('does not invent an increase when the previous period was zero', () => {
    const data = response({
      vehicleRanking: [
        { ...response().vehicleRanking[0]!, changePercent: null, previousTotal: '0.00' },
      ],
    });
    expect(buildInsights(data).some((i) => i.key === 'biggestIncrease')).toBe(false);
  });

  it('surfaces missing data instead of hiding it', () => {
    const insights = buildInsights(response());
    expect(insights.some((i) => i.key === 'missingDistance')).toBe(true);
    expect(insights.some((i) => i.key === 'pendingReceipts')).toBe(true);
  });

  it('reports the largest cost category', () => {
    const insights = buildInsights(response());
    expect(insights.some((i) => i.key === 'largestCategory.fuel')).toBe(true);
  });

  it('returns nothing for no data at all', () => {
    expect(buildInsights(null)).toEqual([]);
  });
});

describe('error mapping', () => {
  it('maps every backend code to a translation key, never the raw code', () => {
    for (const code of [
      'cost_dashboard_reversed_range',
      'cost_dashboard_range_in_future',
      'cost_dashboard_range_too_large',
      'cost_dashboard_invalid_range',
    ]) {
      const key = costDashboardErrorKey(code);
      expect(key).toMatch(/^costs\.dashboard\.errors\./);
      expect(key).not.toContain(code);
    }
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(costDashboardErrorKey('brand_new_code')).toBe('costs.dashboard.errors.generic');
  });
});

describe('trend serisi', () => {
  const series = [
    { bucket: '2026-07', label: '2026-07', fuel: '100.00', service: '50.00', fines: '10.00', total: '160.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: '900.00', actualRevenue: '800.00', distanceKm: '2000', costPerKm: '0.080' },
    { bucket: '2026-08', label: '2026-08', fuel: '120.00', service: '0.00', fines: '0.00', total: '120.00', pendingService: '0.00', disputedFines: '0.00', estimatedRevenue: null, actualRevenue: null, distanceKm: null, costPerKm: null },
  ];

  it('secilen olcutun degerlerini dondurur', () => {
    expect(toTrendSeries(series, 'fuel')).toEqual([
      { bucket: '2026-07', value: 100 },
      { bucket: '2026-08', value: 120 },
    ]);
  });

  it('maliyet/km olmayan ayi SIFIRA cevirmez', () => {
    // Sifir "bedava" demek olurdu; eksik veri kendi anlamini korumali.
    expect(toTrendSeries(series, 'costPerKm')[1]).toEqual({ bucket: '2026-08', value: null });
  });

  it('para olcutlerinde eksik ay sifir sayilir', () => {
    expect(toTrendSeries(series, 'fines')[1].value).toBe(0);
  });

  it('mesafe verisi hic yoksa maliyet/km secilemez', () => {
    expect(isTrendMetricAvailable('costPerKm', [series[1]])).toBe(false);
  });

  it('tek bir ayda bile veri varsa maliyet/km secilebilir', () => {
    expect(isTrendMetricAvailable('costPerKm', series)).toBe(true);
  });

  it('para olcutleri her zaman secilebilir', () => {
    expect(isTrendMetricAvailable('total', [])).toBe(true);
  });

  it('bos degeri tire olarak bicimler', () => {
    expect(formatTrendValue(null, 'costPerKm', 'EUR', 'de-DE')).toBe('—');
  });

  it('maliyet/km degerini km ekiyle bicimler', () => {
    expect(formatTrendValue(0.08, 'costPerKm', 'EUR', 'de-DE')).toContain('/km');
  });
});

describe('maliyet/km kapsami', () => {
  it('esigin altinda uyari ister', () => {
    expect(isCoverageLow('61.00')).toBe(true);
  });

  it('esigin ustunde uyari istemez', () => {
    expect(isCoverageLow('99.00')).toBe(false);
  });

  it('kapsam bilinmiyorsa uyari UYDURMAZ', () => {
    expect(isCoverageLow(null)).toBe(false);
  });

  it('kapsam yuzdesini isaretsiz bicimler', () => {
    expect(formatCoveragePercent('62.50', 'de-DE')).not.toContain('+');
  });
});

describe('CSV disa aktarimi', () => {
  it('formul karakteriyle baslayan hucreyi etkisizlestirir', () => {
    // Excel'de `=` ile baslayan hucre CALISTIRILIR.
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+49 170')).toBe("'+49 170");
    expect(escapeCsvCell('-12')).toBe("'-12");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });

  it('virgul ve tirnak iceren hucreyi kacisla sarar', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });

  it('basliga para birimi sutunu koyar', () => {
    const csv = buildCostDashboardCsv(response());
    expect(csv.split('\n')[0]).toContain('currency');
  });

  it('tutarlari makine okunabilir decimal olarak yazar', () => {
    const csv = buildCostDashboardCsv(response());
    // Locale sembolu ya da bin ayraci YOK.
    expect(csv).not.toContain('€');
    expect(csv).toContain('1000.00');
  });

  it('mesafe verisi yoksa maliyet/km hucresini BOS birakir', () => {
    const csv = buildCostDashboardCsv(
      response({
        vehicleRanking: [
          {
            vehicleId: 'v-1',
            plateNumber: 'DU-AB 123',
            displayName: null,
            fuel: '10.00',
            service: '0.00',
            fines: '0.00',
            total: '10.00',
            pendingService: '0.00',
            disputedFines: '0.00',
            estimatedRevenue: null,
            actualRevenue: null,
            margin: null,
            distanceKm: null,
            costPerKm: null,
            previousTotal: '0.00',
            changePercent: null,
            dataQuality: ['no_distance'],
          },
        ],
      }),
    );
    const header = csv.split('\n')[0].split(',');
    const row = csv.split('\n')[1].split(',');
    // `0` yazmak "kilometresi bedava" demek olurdu.
    expect(row[header.indexOf('cost_per_km')]).toBe('');
  });

  it('donusturulmemis tutarlari AYRI bir bolumde listeler', () => {
    const csv = buildCostDashboardCsv(
      response({ unconvertedByCurrency: [{ currency: 'TRY', amount: '4200.00', entryCount: 2 }] }),
    );
    expect(csv).toContain('unconverted_currency');
    expect(csv).toContain('TRY');
  });

  it('donusturulmemis tutar yoksa o bolumu hic yazmaz', () => {
    expect(buildCostDashboardCsv(response())).not.toContain('unconverted_currency');
  });

  it('dosya adi secili donemi tasir', () => {
    expect(costDashboardCsvName(response())).toMatch(/^fahrzeugkosten-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('Faz 18B — CSV ekranla ayni kurallari kullanir', () => {
  const header = (csv: string) => csv.split('\n')[0].split(',');
  const cell = (csv: string, column: string, line = 1) =>
    csv.split('\n')[line].split(',')[header(csv).indexOf(column)];

  it('TEK bir "revenue" sutunu YOKTUR; tahmin ve gercek AYRI', () => {
    // Tek sutun, dosyayi acan kisinin hangisine baktigini bilmemesi demekti.
    const csv = buildCostDashboardCsv(response());
    expect(header(csv)).not.toContain('revenue');
    expect(header(csv)).toContain('estimated_revenue');
    expect(header(csv)).toContain('actual_revenue');
    expect(cell(csv, 'estimated_revenue')).toBe('4000.00');
    expect(cell(csv, 'actual_revenue')).toBe('4000.00');
  });

  it('onay bekleyen servis ve ihtilafli ceza AYRI sutunlarda', () => {
    const csv = buildCostDashboardCsv(
      response({
        vehicleRanking: [
          {
            vehicleId: 'v1',
            plateNumber: 'AA-1',
            displayName: null,
            fuel: '100.00',
            service: '250.00',
            fines: '60.00',
            total: '410.00',
            pendingService: '900.00',
            disputedFines: '320.00',
            estimatedRevenue: null,
            actualRevenue: null,
            margin: null,
            distanceKm: '100.000',
            costPerKm: '4.1000',
            previousTotal: '0.00',
            changePercent: null,
            dataQuality: ['no_actual_revenue'],
          },
        ],
      }),
    );
    expect(cell(csv, 'pending_service')).toBe('900.00');
    expect(cell(csv, 'disputed_fines')).toBe('320.00');
    // Toplam onlari ICERMIYOR: 100 + 250 + 60.
    expect(cell(csv, 'total')).toBe('410.00');
  });

  it('olculemeyen gelir ve marj BOS kalir, sifir yazilmaz', () => {
    const csv = buildCostDashboardCsv(response());
    // Ikinci arac (v2) faturasiz.
    expect(cell(csv, 'actual_revenue', 2)).toBe('');
    expect(cell(csv, 'margin', 2)).toBe('');
  });

  it('toplama girmeyen tutarlari AYRI bir blokta yazar', () => {
    const csv = buildCostDashboardCsv(
      response({
        excludedFromTotals: {
          pendingService: '900.00',
          pendingServiceCount: 2,
          disputedFines: '320.00',
          disputedFineCount: 1,
          pendingReceiptCount: 3,
        },
      }),
    );
    expect(csv).toContain('excluded_from_totals,amount,count,currency');
    expect(csv).toContain('pending_service,900.00,2,EUR');
    expect(csv).toContain('disputed_fines,320.00,1,EUR');
    // Satirlara karistirilsaydi maliyetmis gibi toplanabilirdi.
    expect(csv.split('\n').indexOf('excluded_from_totals,amount,count,currency')).toBeGreaterThan(2);
  });

  it('bekleyen servis ve ihtilafli ceza ICGORU olarak yazilir', () => {
    const insights = buildInsights(
      response({
        summary: {
          ...response().summary,
          pendingServiceCost: '900.00',
          pendingServiceCount: 2,
          disputedFineCost: '320.00',
          disputedFineCount: 1,
        },
      }),
    );
    expect(insights.map((item) => item.key)).toEqual(
      expect.arrayContaining(['pendingService', 'disputedFines']),
    );
  });
});
