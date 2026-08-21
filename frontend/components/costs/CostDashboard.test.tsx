import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Maliyet dashboard'u.
 *
 * Backend MOCK. Sinanan sey grafik piksellerinin gorunusu DEGIL, ekranin
 * verdigi bilgi: rakamlar, eksik verinin nasil anlatildigi, secimin
 * senkron kalmasi, drill-down baglantilarinin donemi tasimasi ve CSV.
 *
 * recharts ADAPTOR SINIRINDA mock'lu: jsdom'da SVG olcumu yok, gercek
 * kutuphaneyi calistirmak sifir genislikte bos grafik uretir ve hicbir sey
 * kanitlamaz. Ayni serinin METIN karsiligi zaten ekranda — testler onu okur,
 * ki bu ekran okuyucunun okudugu seyle ayni.
 */
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  const Leaf = () => null;
  return {
    ResponsiveContainer: Box,
    BarChart: Box,
    LineChart: Box,
    PieChart: Box,
    Pie: Box,
    Bar: Leaf,
    Line: Leaf,
    Cell: Leaf,
    CartesianGrid: Leaf,
    Legend: Leaf,
    Tooltip: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  };
});

const getCostDashboard = vi.fn();

vi.mock('@/lib/api', () => ({
  dashboardApi: {
    getCostDashboard: (...args: unknown[]) => getCostDashboard(...args),
  },
}));

import type { CostDashboardResponse } from '@/lib/types';
import { CostDashboard } from './CostDashboard';

function metric(current: string, previous: string, percent: string | null) {
  return {
    current,
    previous,
    absoluteChange: String(Number(current) - Number(previous)),
    percentChange: percent,
  };
}

function month(bucket: string, over: Partial<CostDashboardResponse['monthlySeries'][number]> = {}) {
  return {
    bucket,
    label: bucket,
    fuel: '100.00',
    service: '50.00',
    fines: '10.00',
    total: '160.00',
    pendingService: '0.00',
    disputedFines: '0.00',
    estimatedRevenue: '900.00',
    actualRevenue: '700.00',
    distanceKm: '2000',
    costPerKm: '0.080',
    ...over,
  };
}

function vehicle(
  id: string,
  plate: string,
  over: Partial<CostDashboardResponse['vehicleRanking'][number]> = {},
) {
  return {
    vehicleId: id,
    plateNumber: plate,
    displayName: `LKW ${plate}`,
    fuel: '600.00',
    service: '300.00',
    fines: '60.00',
    total: '960.00',
    pendingService: '0.00',
    disputedFines: '0.00',
    estimatedRevenue: '5400.00',
    actualRevenue: '5400.00',
    margin: '4440.00',
    distanceKm: '12000',
    costPerKm: '0.080',
    previousTotal: '800.00',
    changePercent: '20.00',
    dataQuality: [] as string[],
    ...over,
  };
}

function response(over: Partial<CostDashboardResponse> = {}): CostDashboardResponse {
  return {
    baseCurrency: 'EUR',
    period: { from: '2026-03-01T00:00:00.000Z', to: '2026-08-31T21:59:59.999Z', timezone: 'Europe/Berlin' },
    comparisonPeriod: { from: '2025-09-01T00:00:00.000Z', to: '2026-02-28T23:00:00.000Z' },
    summary: {
      totalCost: metric('1920.00', '1600.00', '20.00'),
      fuelCost: metric('1200.00', '1000.00', '20.00'),
      serviceCost: metric('600.00', '500.00', '20.00'),
      fineCost: metric('120.00', '100.00', '20.00'),
      estimatedRevenue: metric('10800.00', '9000.00', '20.00'),
      actualRevenue: metric('10800.00', '9000.00', '20.00'),
      margin: metric('8880.00', '7400.00', '20.00'),
      costPerKm: metric('0.080', '0.070', '14.29'),
      distanceKm: metric('24000', '22000', '9.09'),
      pendingReceiptCount: 3,
      pendingServiceCost: '0.00',
      pendingServiceCount: 0,
      disputedFineCost: '0.00',
      disputedFineCount: 0,
    },
    monthlySeries: [month('2026-07'), month('2026-08')],
    composition: { fuel: '1200.00', service: '600.00', fines: '120.00', total: '1920.00' },
    excludedFromTotals: {
      pendingService: '0.00',
      pendingServiceCount: 0,
      disputedFines: '0.00',
      disputedFineCount: 0,
      pendingReceiptCount: 3,
    },
    vehicleRanking: [vehicle('v-1', 'DU-AB 123'), vehicle('v-2', 'DU-CD 456')],
    pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
    unconvertedByCurrency: [],
    costPerKmCoverage: {
      includedVehicleCount: 2,
      excludedVehicleCount: 0,
      includedDistanceKm: '24000',
      includedCost: '1920.00',
      totalFleetCost: '1920.00',
      costCoveragePercent: '100.00',
    },
    dataQuality: {
      vehiclesWithoutDistance: 0,
      vehiclesWithoutCosts: 0,
      excludedUnconvertedEntries: 0,
      notes: [],
    },
    ...over,
  };
}

/** Ilk (filo) istegi ile trend (arac) istegini ayirir. */
function respondWith(fleet: CostDashboardResponse, trend?: CostDashboardResponse) {
  getCostDashboard.mockImplementation((params: { vehicleId?: string }) =>
    Promise.resolve(params?.vehicleId ? (trend ?? fleet) : fleet),
  );
}

async function renderDashboard(fleet = response(), trend?: CostDashboardResponse) {
  respondWith(fleet, trend);
  render(<CostDashboard />);
  await screen.findByTestId('cost-dashboard');
}

beforeEach(() => {
  getCostDashboard.mockReset();
});

describe('CostDashboard', () => {
  it('ilk yuklemede iskelet gosterir', () => {
    getCostDashboard.mockImplementation(() => new Promise(() => {}));
    render(<CostDashboard />);
    expect(screen.getByTestId('cost-dashboard-loading')).toBeTruthy();
  });

  it('KPI kartlarinda toplam maliyeti gosterir', async () => {
    await renderDashboard();
    expect(within(screen.getByTestId('kpi-totalCost')).getByText(/1\.920,00/)).toBeTruthy();
  });

  it('KPI kartinda onceki donem degerini de yazar', async () => {
    await renderDashboard();
    const card = screen.getByTestId('kpi-totalCost');
    expect(card.textContent).toContain('costs.dashboard.previous');
  });

  it('onceki donem yoksa yuzde yerine aciklama gosterir', async () => {
    await renderDashboard(
      response({
        summary: { ...response().summary, totalCost: metric('100.00', '0.00', null) },
      }),
    );
    expect(screen.getByTestId('kpi-totalCost').textContent).toContain(
      'costs.dashboard.noPreviousData',
    );
  });

  it('maliyet/km yoksa sifir degil "yetersiz veri" yazar', async () => {
    await renderDashboard(response({ summary: { ...response().summary, costPerKm: null } }));
    expect(screen.getByTestId('kpi-costPerKm').textContent).toContain(
      'costs.dashboard.noDistance',
    );
  });

  it('maliyet/km kapsamini dahil/haric arac sayisiyla anlatir', async () => {
    await renderDashboard(
      response({
        costPerKmCoverage: {
          ...response().costPerKmCoverage,
          includedVehicleCount: 5,
          excludedVehicleCount: 2,
        },
      }),
    );
    const note = screen.getByTestId('coverage-note').textContent ?? '';
    expect(note).toContain('costs.dashboard.coverage.note');
    expect(note).toContain('"included":5');
    expect(note).toContain('"excluded":2');
  });

  it('kapsam dusukse uyari gosterir', async () => {
    await renderDashboard(
      response({
        costPerKmCoverage: { ...response().costPerKmCoverage, costCoveragePercent: '61.00' },
      }),
    );
    expect(screen.getByTestId('coverage-warning')).toBeTruthy();
  });

  it('kapsam yuksekse uyari gostermez', async () => {
    await renderDashboard();
    expect(screen.queryByTestId('coverage-warning')).toBeNull();
  });

  it('bekleyen fisleri sayar ve toplama dahil olmadigini yazar', async () => {
    await renderDashboard();
    const card = screen.getByTestId('kpi-pending');
    expect(within(card).getByText('3')).toBeTruthy();
    expect(card.textContent).toContain('costs.dashboard.pendingNotIncluded');
  });

  it('aylik seriyi tablo olarak da verir', async () => {
    await renderDashboard();
    const rows = within(screen.getByTestId('monthly-table')).getAllByRole('row');
    // Baslik + iki ay.
    expect(rows).toHaveLength(3);
  });

  it('dagilim listesinde yuzdeleri gosterir', async () => {
    await renderDashboard();
    expect(screen.getByTestId('composition-list').textContent).toContain('62.5%');
  });

  it('donusturulmemis tutar yoksa uyari cikmaz', async () => {
    await renderDashboard();
    expect(screen.queryByTestId('unconverted-note')).toBeNull();
  });

  it('donusturulmemis tutar varsa toplama katilmadigini yazar', async () => {
    await renderDashboard(
      response({
        unconvertedByCurrency: [{ currency: 'TRY', amount: '4200.00', entryCount: 2 }],
      }),
    );
    expect(screen.getByTestId('unconverted-note').textContent).toContain('TRY');
  });

  it('arac tablosunda 13 sutun vardir', async () => {
    // Faz 18B: tek "Umsatz" sutunu YERINE tahmini + gercek gelir.
    await renderDashboard();
    const header = within(screen.getByTestId('vehicle-table')).getAllByRole('row')[0];
    expect(within(header).getAllByRole('columnheader')).toHaveLength(13);
  });

  it('arac satirinda tutarlari temel para birimiyle gosterir', async () => {
    await renderDashboard();
    const row = screen.getByTestId('vehicle-row-DU-AB 123');
    expect(row.textContent).toContain('960,00');
  });

  it('mesafe verisi olmayan aracta km yerine aciklama yazar', async () => {
    await renderDashboard(
      response({
        vehicleRanking: [
          vehicle('v-1', 'DU-AB 123', { distanceKm: null, costPerKm: null, dataQuality: ['no_distance'] }),
        ],
      }),
    );
    const row = screen.getByTestId('vehicle-row-DU-AB 123');
    expect(row.textContent).toContain('costs.dashboard.noDistance');
  });

  it('onceki donemi olmayan aracta yuzde uydurmaz', async () => {
    await renderDashboard(
      response({ vehicleRanking: [vehicle('v-1', 'DU-AB 123', { changePercent: null })] }),
    );
    expect(screen.getByTestId('vehicle-row-DU-AB 123').textContent).toContain(
      'costs.dashboard.noPreviousData',
    );
  });

  it('drill-down baglantilari secili donemi tasir', async () => {
    await renderDashboard();
    const row = screen.getByTestId('vehicle-row-DU-AB 123');
    const receipts = within(row).getByText('costs.dashboard.table.linkReceipts');
    expect(receipts.getAttribute('href')).toContain('vehicleId=v-1');
    expect(receipts.getAttribute('href')).toContain('from=2026-03-01');
    expect(receipts.getAttribute('href')).toContain('to=2026-08-31');
  });

  it('servis ve ceza baglantilari da arac ve donem tasir', async () => {
    await renderDashboard();
    const row = screen.getByTestId('vehicle-row-DU-AB 123');
    expect(
      within(row).getByText('costs.dashboard.table.linkService').getAttribute('href'),
    ).toContain('/service-history?vehicle_id=v-1');
    expect(within(row).getByText('costs.dashboard.table.linkFines').getAttribute('href')).toContain(
      '/fines?vehicle_id=v-1',
    );
  });

  it('secim yapilmadan once en pahali aracin gosterildigini yazar', async () => {
    await renderDashboard();
    expect(screen.getByTestId('selected-vehicle').textContent).toContain(
      'costs.dashboard.defaultSelection',
    );
  });

  it('tablodan tiklayinca arac secilir', async () => {
    await renderDashboard();
    await userEvent.click(screen.getByTestId('vehicle-row-DU-CD 456'));
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-row-DU-CD 456').getAttribute('data-selected')).toBe('true'),
    );
  });

  it('secim tablo ve secili arac kartinda AYNI kalir', async () => {
    await renderDashboard();
    await userEvent.click(screen.getByTestId('vehicle-row-DU-CD 456'));
    await waitFor(() =>
      expect(screen.getByTestId('selected-vehicle').textContent).toContain('DU-CD 456'),
    );
    expect(screen.getByTestId('vehicle-row-DU-AB 123').getAttribute('data-selected')).toBe('false');
  });

  it('Enter tusuyla da arac secilir', async () => {
    await renderDashboard();
    screen.getByTestId('vehicle-row-DU-CD 456').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-row-DU-CD 456').getAttribute('data-selected')).toBe('true'),
    );
  });

  it('bosluk tusuyla da arac secilir', async () => {
    await renderDashboard();
    screen.getByTestId('vehicle-row-DU-CD 456').focus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-row-DU-CD 456').getAttribute('data-selected')).toBe('true'),
    );
  });

  it('secili arac icin AYRI bir istek atar', async () => {
    await renderDashboard();
    await waitFor(() =>
      expect(
        getCostDashboard.mock.calls.some(
          ([params]) => (params as { vehicleId?: string }).vehicleId === 'v-1',
        ),
      ).toBe(true),
    );
  });

  it('olcut secicide bes olcut vardir', async () => {
    await renderDashboard();
    const group = await screen.findByTestId('trend-metric-selector');
    expect(within(group).getAllByRole('button')).toHaveLength(5);
  });

  it('mesafe verisi yoksa maliyet/km olcutu secilemez', async () => {
    await renderDashboard(
      response(),
      response({ monthlySeries: [month('2026-07', { costPerKm: null, distanceKm: null })] }),
    );
    await waitFor(() =>
      expect(
        (screen.getByTestId('trend-metric-costPerKm') as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it('secilemeyen olcutun sebebini yazar', async () => {
    await renderDashboard(
      response(),
      response({ monthlySeries: [month('2026-07', { costPerKm: null, distanceKm: null })] }),
    );
    expect((await screen.findByTestId('trend-nodistance-hint')).textContent).toContain(
      'costs.dashboard.trend.noDistanceHint',
    );
  });

  it('mesafe verisi varsa maliyet/km olcutu aciktir', async () => {
    await renderDashboard();
    await waitFor(() =>
      expect(
        (screen.getByTestId('trend-metric-costPerKm') as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('olcut degisince trend tablosu o olcutun degerlerini gosterir', async () => {
    await renderDashboard();
    await screen.findByTestId('trend-table');
    await userEvent.click(screen.getByTestId('trend-metric-fines'));
    await waitFor(() =>
      expect(screen.getByTestId('trend-table').textContent).toContain('10,00'),
    );
  });

  it('veri olmayan ay trend tablosunda GORUNUR kalir', async () => {
    await renderDashboard(
      response(),
      response({
        monthlySeries: [month('2026-07'), month('2026-08', { costPerKm: null, distanceKm: null })],
      }),
    );
    await screen.findByTestId('trend-table');
    await userEvent.click(screen.getByTestId('trend-metric-costPerKm'));
    await waitFor(() => {
      const rows = within(screen.getByTestId('trend-table')).getAllByRole('row');
      // Baslik + iki ay: eksik ay ATLANMIYOR.
      expect(rows).toHaveLength(3);
      expect(rows[2].textContent).toContain('—');
    });
  });

  it('trend istegi basarisizsa yeniden dene sunar', async () => {
    getCostDashboard.mockImplementation((params: { vehicleId?: string }) =>
      params?.vehicleId ? Promise.reject(new Error('boom')) : Promise.resolve(response()),
    );
    render(<CostDashboard />);
    expect((await screen.findByTestId('trend-error')).textContent).toContain(
      'costs.dashboard.errors',
    );
  });

  it('trend hatasinda ham hata kodu sizmaz', async () => {
    getCostDashboard.mockImplementation((params: { vehicleId?: string }) =>
      params?.vehicleId
        ? Promise.reject({ response: { data: { code: 'internal_db_failure' } } })
        : Promise.resolve(response()),
    );
    render(<CostDashboard />);
    const box = await screen.findByTestId('trend-error');
    expect(box.textContent).not.toContain('internal_db_failure');
  });

  it('CSV disa aktarimi temel para birimini ve donemi tasir', async () => {
    await renderDashboard();
    const chunks: string[] = [];
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        chunks.push(this.download);
      });

    await userEvent.click(screen.getByTestId('cost-dashboard-export'));

    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0];
    const text = await blob.text();
    expect(text).toContain('currency');
    expect(text).toContain('EUR');
    // Tutarlar MAKINE OKUNABILIR: locale sembolu yok.
    expect(text).toContain('960.00');
    expect(chunks[0]).toBe('fahrzeugkosten-2026-03-01-2026-08-31.csv');
    clickSpy.mockRestore();
  });

  it('donem degisince yeniden veri ceker', async () => {
    await renderDashboard();
    const before = getCostDashboard.mock.calls.length;
    await userEvent.click(screen.getByText('costs.dashboard.months {"count":12}'));
    await waitFor(() => expect(getCostDashboard.mock.calls.length).toBeGreaterThan(before));
    expect(
      getCostDashboard.mock.calls.some(([params]) => (params as { months?: number }).months === 12),
    ).toBe(true);
  });

  it('siralama dugmesi secili durumunu bildirir', async () => {
    await renderDashboard();
    await userEvent.click(screen.getByText('costs.dashboard.sort.costPerKm'));
    await waitFor(() =>
      expect(
        screen.getByText('costs.dashboard.sort.costPerKm').getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('ana istek basarisizsa ham kod yerine ceviri anahtari gosterir', async () => {
    getCostDashboard.mockRejectedValue({ response: { data: { code: 'db_exploded' } } });
    render(<CostDashboard />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('db_exploded');
    expect(alert.textContent).toContain('costs.dashboard.errors');
  });

  it('hata sonrasi yeniden dene tekrar istek atar', async () => {
    getCostDashboard.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(response());
    render(<CostDashboard />);
    await userEvent.click(await screen.findByText('common.retry'));
    await waitFor(() => expect(screen.getByTestId('cost-dashboard')).toBeTruthy());
  });

  it('arac yoksa tabloda bos durum yazar', async () => {
    await renderDashboard(
      response({
        vehicleRanking: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      }),
    );
    expect(screen.getByTestId('vehicle-table').textContent).toContain(
      'costs.dashboard.table.empty',
    );
  });

  it('kac aracin gosterildigini yazar', async () => {
    await renderDashboard();
    expect(screen.getByTestId('vehicle-table').parentElement?.parentElement?.textContent).toContain(
      'costs.dashboard.table.pagination',
    );
  });
});

describe('Faz 18B — tahmin ile gerceklesen ayrimi', () => {
  it('gelir TEK kartta degil, TAHMIN ve GERCEK olarak AYRI kartlarda', async () => {
    await renderDashboard();
    // Iki ayri KPI karti; tek bir "Umsatz" karti YOK.
    expect(screen.getByTestId('kpi-estimatedRevenue')).toBeTruthy();
    expect(screen.getByTestId('kpi-actualRevenue')).toBeTruthy();
    expect(screen.queryByTestId('kpi-revenue')).toBeNull();
  });

  it('kartlar sinifi METIN olarak yazar — renk tek basina anlam tasimaz', async () => {
    // i18n bu testte anahtari aynen dondurdugu icin ROZETIN KENDISI degil,
    // dogru rozetin secildigi olculuyor.
    await renderDashboard();
    expect(screen.getByTestId('kpi-estimatedRevenue').textContent).toContain(
      'costs.dashboard.recognition.forecast',
    );
    expect(screen.getByTestId('kpi-actualRevenue').textContent).toContain(
      'costs.dashboard.recognition.approved_actual',
    );
  });

  it('faturasi olmayan filoda GERCEK gelir ve marj SIFIR gosterilmez', async () => {
    await renderDashboard(
      response({
        summary: { ...response().summary, actualRevenue: null, margin: null },
      }),
    );
    // Sifir "gelir yok" diye okunurdu; dogru cevap "olculemedi".
    expect(screen.getByTestId('kpi-actualRevenue').textContent).toContain(
      'costs.dashboard.unknownValue',
    );
    expect(screen.getByTestId('kpi-margin').textContent).toContain(
      'costs.dashboard.unknownValue',
    );
  });

  it('toplama girmeyen tutarlari AYRI bir kartta gosterir', async () => {
    await renderDashboard(
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
    const card = screen.getByTestId('kpi-excluded');
    expect(card.textContent).toContain('900');
    expect(card.textContent).toContain('320');
  });

  it('arac satirinda faturasi olmayan marj hucresi SEBEBINI yazar', async () => {
    await renderDashboard(
      response({
        vehicleRanking: [vehicle('v-1', 'DU-AB 123', { actualRevenue: null, margin: null })],
      }),
    );
    const table = screen.getByTestId('vehicle-table');
    // Bos hucre ya da `—` DEGIL: ikisi de "sifir" diye okunurdu.
    expect(table.textContent).toContain('costs.dashboard.marginUnknown');
    expect(table.textContent).toContain('costs.dashboard.unknownValue');
    // TAHMIN yerinde duruyor: gercek gelirin yoklugu onu silmiyor.
    expect(table.textContent).toContain('5.400,00');
  });
});
