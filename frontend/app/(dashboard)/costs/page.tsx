'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Euro, WifiOff, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dashboardApi, getApiErrorMessage } from '@/lib/api';
import {
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { CostDashboard } from '@/components/costs/CostDashboard';
import { escapeCsvCell } from '@/lib/cost-dashboard-view';
import { FuelReceiptReviewPanel } from '@/components/costs/FuelReceiptReviewPanel';
import { FuelReconciliationQueue } from '@/components/costs/FuelReconciliationQueue';
import type { VehicleCostsResponse } from '@/lib/types';
import { formatFleetCurrency } from '@/lib/locale-format';

const PERIOD_OPTIONS = [3, 6, 12];

/**
 * CSV EKRANLA AYNI KURALLARI KULLANIR.
 *
 * Kolon adlari sinifi TASIYOR: `service_cost` yalnizca onayli servis,
 * `pending_service_cost` onay bekleyen, `disputed_fine_cost` itiraz edilmis
 * ceza. `revenue` kolonu KALDIRILDI ve yerine `estimated_revenue` ile
 * `actual_revenue` geldi — tek bir "revenue" kolonu, tabloyu acan kisinin
 * hangisine baktigini bilmemesi demekti.
 *
 * Olculemeyen deger BOS birakiliyor, `0` yazilmiyor: faturasi olmayan bir
 * aracin marjina `0,00` yazmak "basa bas" demek olurdu.
 */
function downloadCostsCsv(data: VehicleCostsResponse) {
  const headers = [
    'plate_number',
    'internal_code',
    'brand',
    'model',
    'service_cost',
    'pending_service_cost',
    'fine_cost',
    'disputed_fine_cost',
    'fuel_cost',
    'total_cost',
    'estimated_revenue',
    'actual_revenue',
    'margin',
    // Tutarlarin CINSI dosyada yaziyor: EUR varsayimi yok.
    'currency',
  ];
  const lines = [headers.join(',')];
  for (const row of data.vehicles) {
    lines.push(
      [
        row.plate_number,
        row.internal_code,
        row.brand,
        row.model,
        // Yalnizca ONAYLANMIS servis; bekleyen AYRI kolonda.
        row.service_cost.toFixed(2),
        row.pending_service_cost.toFixed(2),
        // Itiraz edilmis ceza toplamda DEGIL; kendi kolonunda.
        row.fine_cost.toFixed(2),
        row.disputed_fine_cost.toFixed(2),
        // Yalnizca ONAYLANMIS yakit; export da ayni kurala uyuyor.
        row.fuel_cost.toFixed(2),
        row.total_cost.toFixed(2),
        row.estimated_revenue.toFixed(2),
        row.actual_revenue === null ? '' : row.actual_revenue.toFixed(2),
        row.margin === null ? '' : row.margin.toFixed(2),
        data.baseCurrency,
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(','),
    );
  }

  // Toplama GIRMEYEN tutarlar dosyanin sonunda ayri bir blokta: satirlara
  // karistirmak, onlari maliyetmis gibi toplanabilir kilardi.
  lines.push('');
  lines.push('excluded_from_totals,amount,count,currency');
  lines.push(
    ['pending_service', data.excludedFromTotals.pendingService.amount, String(data.excludedFromTotals.pendingServiceCount), data.baseCurrency]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );
  lines.push(
    ['disputed_fines', data.excludedFromTotals.disputedFines.amount, String(data.excludedFromTotals.disputedFineCount), data.baseCurrency]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );
  lines.push(
    ['pending_fuel_receipts', '', String(data.excludedFromTotals.pendingReceiptCount), data.baseCurrency]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );
  lines.push(
    [
      'actual_revenue_without_vehicle',
      data.excludedFromTotals.actualRevenueWithoutVehicle.amount,
      String(data.excludedFromTotals.actualRevenueWithoutVehicleCount),
      data.baseCurrency,
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(','),
  );

  if (data.unconvertedByCurrency.length > 0) {
    lines.push('');
    lines.push('unconverted_currency,unconverted_amount,unconverted_entry_count');
    for (const entry of data.unconvertedByCurrency) {
      lines.push(
        [entry.currency, entry.amount, String(entry.entryCount)]
          .map((cell) => escapeCsvCell(cell))
          .join(','),
      );
    }
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fahrzeugkosten-${data.from}-${data.to}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CostsPage() {
  // Suspense: `useSearchParams` istemci tarafinda askiya alabilir.
  return (
    <Suspense fallback={null}>
      <CostsPageContent />
    </Suspense>
  );
}

function CostsPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [months, setMonths] = useState(6);
  /**
   * Sekmeler ayni rotada: mevcut `/costs` baglantilari ve yer imleri
   * BOZULMUYOR. Yeni bir rota acip eskisini yonlendirmek, calisan linkleri
   * bir sey kazanmadan riske atardi.
   */
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<'dashboard' | 'summary' | 'receipts' | 'reconciliation'>(
    // Drill-down baglantisi dogrudan dogru sekmeyi aciyor.
    tabParam === 'receipts' || tabParam === 'summary' || tabParam === 'reconciliation'
      ? tabParam
      : 'dashboard',
  );

  /** Drill-down filtresi — yalnizca fis sekmesi icin anlamli. */
  const receiptFilter = useMemo(() => {
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) return undefined;
    return {
      vehicleId,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    };
  }, [searchParams]);
  const [data, setData] = useState<VehicleCostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.getVehicleCosts(months);
      setData(result);
    } catch (e) {
      setData(null);
      setError(getApiErrorMessage(e, t('costs.loadError')));
    } finally {
      setLoading(false);
    }
  }, [months, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ozet kartlari.
   *
   * `basis` alani KART BASINA sinifi tasiyor ve ekranda ROZET olarak
   * yaziliyor: renk tek basina anlam tasimaz (renk korlugu, yazdirma, ekran
   * okuyucu), bu yuzden "Tahmin" / "Gercek" metin olarak da duruyor.
   *
   * `value: null` = OLCULEMEDI. Sifir gostermek yerine acikca "bilinmiyor"
   * yazmak, faturasi olmayan bir filoya "0 EUR ciro" demekten iyidir.
   */
  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'total', label: t('costs.summary.totalCost'), value: data.fleet.total_cost, basis: 'actual' as const },
      { key: 'service', label: t('costs.summary.serviceCost'), value: data.fleet.service_cost, basis: 'actual' as const },
      { key: 'fines', label: t('costs.summary.fineCost'), value: data.fleet.fine_cost, basis: 'actual' as const },
      // ONAYLANMIS yakit. Bekleyen fisler bu rakama DAHIL DEGIL — ayri
      // gosteriliyor ki "gorunmeyen ne var" sorusu cevapsiz kalmasin.
      { key: 'fuel', label: t('costs.summary.fuelCost'), value: data.fleet.fuel_cost, basis: 'actual' as const },
      {
        key: 'estimatedRevenue',
        label: t('costs.summary.estimatedRevenue'),
        value: data.fleet.estimated_revenue,
        basis: 'estimated' as const,
      },
      {
        key: 'actualRevenue',
        label: t('costs.summary.actualRevenue'),
        value: data.fleet.actual_revenue,
        basis: 'actual' as const,
      },
      { key: 'margin', label: t('costs.summary.margin'), value: data.fleet.margin, basis: 'actual' as const },
      {
        key: 'avg',
        label: t('costs.summary.avgPerVehicle'),
        value: data.fleet.avg_cost_per_vehicle,
        basis: 'actual' as const,
      },
    ];
  }, [data, t]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Euro className="h-8 w-8 text-blue-700" />
          <h1 className={FLEET_PAGE_TITLE}>{t('costs.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={FLEET_FILTER_SELECT}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t('costs.period', { count: option })}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!data || data.vehicles.length === 0}
            onClick={() => data && downloadCostsCsv(data)}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Araclar > Arac maliyetleri altinda iki sekme. Rota AYNI kaliyor. */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {(['dashboard', 'summary', 'receipts', 'reconciliation'] as const).map((key) => (
          <Button
            key={key}
            type="button"
            role="tab"
            size="sm"
            aria-selected={tab === key}
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            {t(`costs.tabs.${key}`)}
            {key === 'receipts' && data && data.fuel.pending_count > 0 ? (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                {data.fuel.pending_count}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      {tab === 'dashboard' ? <CostDashboard /> : null}
      {tab === 'receipts' ? <FuelReceiptReviewPanel filter={receiptFilter} /> : null}
      {/* Telematik mutabakati (Faz 11) — AYRI sekme. Fis kuyruguna
          karistirmadi: o kuyruk "karar bekleyen" fisleri gosteriyor, bu
          liste ise ZATEN ONAYLANMIS fislerin kontrolu. Ikisini tek listede
          birlestirmek, muhasebenin "simdi ne yapmam gerekiyor" sorusunu
          bulaniklastirirdi. */}
      {tab === 'reconciliation' ? (
        <FuelReconciliationQueue vehicleId={receiptFilter?.vehicleId} />
      ) : null}

      {tab === 'summary' && !loading && error ? (
        <EmptyState
          icon={WifiOff}
          title={t('costs.loadErrorTitle')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => {
            void load();
          }}
        />
      ) : null}

      {tab === 'summary' && !loading && !error && data ? (
        <>
          <p className="text-sm text-slate-500">
            {t('costs.periodInfo', { from: data.from, to: data.to })}
          </p>

          {/* Onay bekleyen servis ve itiraz edilmis ceza TOPLAMA DAHIL DEGIL.
              Tutarlariyla birlikte yaziliyorlar: "toplam eksik" oldugunu
              gormek, eksik oldugunu bilmemekten iyidir. */}
          {data.excludedFromTotals.pendingServiceCount > 0 ||
          data.excludedFromTotals.disputedFineCount > 0 ? (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="excluded-from-totals-note"
            >
              {t('costs.excludedFromTotalsNote', {
                pendingAmount: formatFleetCurrency(
                  Number(data.excludedFromTotals.pendingService.amount),
                  data.baseCurrency,
                ),
                pendingCount: data.excludedFromTotals.pendingServiceCount,
                disputedAmount: formatFleetCurrency(
                  Number(data.excludedFromTotals.disputedFines.amount),
                  data.baseCurrency,
                ),
                disputedCount: data.excludedFromTotals.disputedFineCount,
              })}
            </p>
          ) : null}

          {/* Bekleyen fisler TOPLAMA DAHIL DEGIL; sayisi ayri duruyor. */}
          {data.fuel.pending_count > 0 ? (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="pending-fuel-note"
            >
              {t('costs.pendingFuelNote', { count: data.fuel.pending_count })}
            </p>
          ) : null}

          {/* Base currency DISINDAKI onaylanmis fisler toplama katilmadi:
              guvenilir bir kur altyapisi olmadan donusturmek kur uydurmak
              olurdu. Ayri ve acikca "donusturulmemis" gosteriliyor. */}
          {data.fuel.unconverted.length > 0 ? (
            <p
              className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700"
              data-testid="unconverted-fuel-note"
            >
              {t('costs.unconvertedFuelNote', {
                base: data.baseCurrency,
                list: data.fuel.unconverted
                  .map((entry) => `${entry.amount} ${entry.currency} (${entry.count})`)
                  .join(', '),
              })}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <Card key={card.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <span
                    className={`text-xl font-semibold ${
                      card.key === 'margin' && card.value !== null
                        ? card.value >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {card.value === null
                      ? t('costs.unknownValue')
                      : formatFleetCurrency(card.value, data.baseCurrency)}
                  </span>
                  {/* Sinif METIN olarak da duruyor: renk tek basina anlam
                      tasimaz. */}
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {card.basis === 'estimated'
                      ? t('costs.basis.estimated')
                      : t('costs.basis.actual')}
                  </p>
                  {card.value === null ? (
                    <p className="mt-1 text-xs text-slate-500">{t('costs.noActualRevenueHint')}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className={FLEET_LIST_CARD}>
            <CardContent className="p-0">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.vehicle')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.service')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.fines')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.totalCost')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('costs.table.estimatedRevenue')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('costs.table.actualRevenue')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.margin')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {data.vehicles.map((row) => (
                    <TableRow
                      key={row.vehicle_id}
                      className={FLEET_TABLE_ROW_CLICKABLE}
                      onClick={() => {
                        window.location.href = `/vehicles/${row.vehicle_id}`;
                      }}
                    >
                      <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                        <div className="font-medium">{row.plate_number}</div>
                        <div className="text-xs text-slate-500">
                          {row.internal_code} · {row.brand} {row.model}
                        </div>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {formatFleetCurrency(row.service_cost, data.baseCurrency)}
                        <span className="ml-1 text-xs text-slate-400">({row.service_count})</span>
                        {/* Onay bekleyen servis toplamda DEGIL — ama gizli de
                            degil: tutari ve adediyle burada duruyor. */}
                        {row.pending_service_count > 0 ? (
                          <div className="text-xs text-amber-700">
                            {t('costs.table.pendingServiceHint', {
                              amount: formatFleetCurrency(
                                row.pending_service_cost,
                                data.baseCurrency,
                              ),
                              count: row.pending_service_count,
                            })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {formatFleetCurrency(row.fine_cost, data.baseCurrency)}
                        <span className="ml-1 text-xs text-slate-400">({row.fine_count})</span>
                        {row.disputed_fine_count > 0 ? (
                          <div className="text-xs text-amber-700">
                            {t('costs.table.disputedFineHint', {
                              amount: formatFleetCurrency(
                                row.disputed_fine_cost,
                                data.baseCurrency,
                              ),
                              count: row.disputed_fine_count,
                            })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className={`${FLEET_TABLE_CELL} font-semibold`}>
                        {formatFleetCurrency(row.total_cost, data.baseCurrency)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {formatFleetCurrency(row.estimated_revenue, data.baseCurrency)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {/* Fatura yoksa `unknown` — sifir ya da tire DEGIL. */}
                        {row.actual_revenue === null
                          ? t('costs.unknownValue')
                          : formatFleetCurrency(row.actual_revenue, data.baseCurrency)}
                      </TableCell>
                      <TableCell
                        className={`${FLEET_TABLE_CELL} font-semibold ${
                          row.margin === null
                            ? 'text-slate-500'
                            : row.margin >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                        }`}
                      >
                        {row.margin === null
                          ? t('costs.unknownValue')
                          : formatFleetCurrency(row.margin, data.baseCurrency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.vehicles.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  {t('costs.empty')}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-500">{t('common.loading')}</div>
      ) : null}
    </div>
  );
}
