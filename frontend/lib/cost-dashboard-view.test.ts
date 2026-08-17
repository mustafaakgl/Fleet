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
  trendDirection,
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
    },
    monthlySeries: [
      { bucket: '2026-05', label: '2026-05', fuel: '0.00', service: '0.00', fines: '0.00', total: '0.00', revenue: null, distanceKm: null, costPerKm: null },
      { bucket: '2026-06', label: '2026-06', fuel: '700.00', service: '400.00', fines: '100.00', total: '1200.00', revenue: '5000.00', distanceKm: '2400.000', costPerKm: '0.5000' },
    ],
    composition: { fuel: '700.00', service: '400.00', fines: '100.00', total: '1200.00' },
    vehicleRanking: [
      { vehicleId: 'v1', plateNumber: 'AA-1', displayName: 'MAN TGX', fuel: '700.00', service: '300.00', fines: '0.00', total: '1000.00', revenue: '4000.00', margin: '3000.00', distanceKm: '2000.000', costPerKm: '0.5000', previousTotal: '800.00', changePercent: '25.0', dataQuality: [] },
      { vehicleId: 'v2', plateNumber: 'BB-2', displayName: null, fuel: '0.00', service: '100.00', fines: '100.00', total: '200.00', revenue: null, margin: null, distanceKm: null, costPerKm: null, previousTotal: '0.00', changePercent: null, dataQuality: ['no_distance'] },
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
