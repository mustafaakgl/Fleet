'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { FuelReceiptReviewPanel } from '@/components/costs/FuelReceiptReviewPanel';
import type { VehicleCostsResponse } from '@/lib/types';
import { formatFleetCurrency } from '@/lib/locale-format';

const PERIOD_OPTIONS = [3, 6, 12];

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCostsCsv(data: VehicleCostsResponse) {
  const headers = [
    'plate_number',
    'internal_code',
    'brand',
    'model',
    'service_cost',
    'fine_cost',
    'fuel_cost',
    'total_cost',
    'revenue',
    'margin',
  ];
  const lines = [headers.join(',')];
  for (const row of data.vehicles) {
    lines.push(
      [
        row.plate_number,
        row.internal_code,
        row.brand,
        row.model,
        row.service_cost.toFixed(2),
        row.fine_cost.toFixed(2),
        // Yalnizca ONAYLANMIS yakit; export da ayni kurala uyuyor.
        row.fuel_cost.toFixed(2),
        row.total_cost.toFixed(2),
        row.revenue.toFixed(2),
        row.margin.toFixed(2),
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(','),
    );
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
  const { t } = useTranslation();
  const [months, setMonths] = useState(6);
  /**
   * Sekmeler ayni rotada: mevcut `/costs` baglantilari ve yer imleri
   * BOZULMUYOR. Yeni bir rota acip eskisini yonlendirmek, calisan linkleri
   * bir sey kazanmadan riske atardi.
   */
  const [tab, setTab] = useState<'summary' | 'receipts'>('summary');
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

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'total', label: t('costs.summary.totalCost'), value: data.fleet.total_cost },
      { key: 'service', label: t('costs.summary.serviceCost'), value: data.fleet.service_cost },
      { key: 'fines', label: t('costs.summary.fineCost'), value: data.fleet.fine_cost },
      // ONAYLANMIS yakit. Bekleyen fisler bu rakama DAHIL DEGIL — ayri
      // gosteriliyor ki "gorunmeyen ne var" sorusu cevapsiz kalmasin.
      { key: 'fuel', label: t('costs.summary.fuelCost'), value: data.fleet.fuel_cost },
      { key: 'revenue', label: t('costs.summary.revenue'), value: data.fleet.revenue },
      { key: 'margin', label: t('costs.summary.margin'), value: data.fleet.margin },
      {
        key: 'avg',
        label: t('costs.summary.avgPerVehicle'),
        value: data.fleet.avg_cost_per_vehicle,
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
        {(['summary', 'receipts'] as const).map((key) => (
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

      {tab === 'receipts' ? <FuelReceiptReviewPanel /> : null}

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
                      card.key === 'margin'
                        ? card.value >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {formatFleetCurrency(card.value, data.baseCurrency)}
                  </span>
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
                    <TableHead className={FLEET_TABLE_HEAD}>{t('costs.table.revenue')}</TableHead>
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
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {formatFleetCurrency(row.fine_cost, data.baseCurrency)}
                        <span className="ml-1 text-xs text-slate-400">({row.fine_count})</span>
                      </TableCell>
                      <TableCell className={`${FLEET_TABLE_CELL} font-semibold`}>
                        {formatFleetCurrency(row.total_cost, data.baseCurrency)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{formatFleetCurrency(row.revenue, data.baseCurrency)}</TableCell>
                      <TableCell
                        className={`${FLEET_TABLE_CELL} font-semibold ${
                          row.margin >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatFleetCurrency(row.margin, data.baseCurrency)}
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
