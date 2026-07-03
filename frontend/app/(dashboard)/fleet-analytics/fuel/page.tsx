'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Droplets, Receipt, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fleetFuelAnalyticsApi, getApiErrorMessage } from '@/lib/api';
import { FLEET_FUEL_PERIOD_WEEKS, fleetFuelDateRange, formatWeekLabel } from '@/lib/fleet-fuel-report';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import type { FleetFuelAnalyticsCockpitResponse, FleetFuelEntry } from '@/lib/types';

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadFuelEntriesCsv(entries: FleetFuelEntry[]) {
  const headers = [
    'entered_at',
    'vehicle',
    'driver',
    'odometer_km',
    'liters',
    'total_cost',
    'price_per_liter',
    'is_full_tank',
  ];
  const lines = [headers.join(',')];

  for (const row of entries) {
    lines.push(
      [
        row.enteredAt,
        row.vehiclePlate ?? row.vehicleId,
        row.driverName ?? '',
        row.odometerKm ?? '',
        row.liters,
        row.totalCost,
        row.liters > 0 ? row.totalCost / row.liters : '',
        row.isFullTank ? 'true' : 'false',
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(','),
    );
  }

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fuel-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function intlLocale(language: string): string {
  if (language.startsWith('tr')) return 'tr-TR';
  if (language.startsWith('en')) return 'en-US';
  return 'de-DE';
}

function formatDelta(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

export default function FleetFuelAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<FleetFuelAnalyticsCockpitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = fleetFuelDateRange(weeks);
      const cockpit = await fleetFuelAnalyticsApi.getCockpit(range);
      setData(cockpit);
    } catch (e) {
      setData(null);
      setError(getApiErrorMessage(e, t('fleetFuelReport.loadError', 'Yakıt analitiği yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [t, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = intlLocale(i18n.language);
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  const numberFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const integerFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const overviewCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: 'realLiters',
        label: t('fleetFuelReport.summary.realLiters', 'Gerçek litre (fiş)'),
        value: `${numberFormat.format(data.totals.totalLiters)} L`,
      },
      {
        key: 'estimatedLiters',
        label: t('fleetFuelReport.summary.estimatedLiters', 'Tahmini litre (GPS)'),
        value: `${numberFormat.format(data.totals.totalEstimatedLiters)} L`,
      },
      {
        key: 'deltaLiters',
        label: t('fleetFuelReport.detail.deltaLiters', 'Tahmin − fiş farkı'),
        value: `${formatDelta(data.totals.estimatedVsRealDeltaLiters)} L`,
      },
      {
        key: 'co2',
        label: t('fleetFuelReport.summary.co2', 'CO₂ tahmini'),
        value: `${numberFormat.format(data.totals.co2Kg)} kg`,
      },
      {
        key: 'cost',
        label: t('fleetFuelReport.summary.fuelCost', 'Yakıt maliyeti'),
        value: currency.format(data.totals.totalCost),
      },
      {
        key: 'alerts',
        label: t('fleetFuelReport.summary.suspiciousEvents', 'Şüpheli olay'),
        value: integerFormat.format(data.totals.suspiciousEventCount),
      },
    ];
  }, [currency, data, integerFormat, numberFormat, t]);

  const trendChartData = useMemo(() => {
    if (!data) return [];
    return data.weeklyTrend.map((week) => ({
      weekStart: week.weekStart,
      label: formatWeekLabel(week.weekStart),
      realAvg: week.realLitersPer100Km,
      estimatedAvg: week.estimatedLitersPer100Km,
      distanceKm: week.tripDistanceKm,
    }));
  }, [data]);

  const vehicleChartData = useMemo(() => {
    if (!data) return [];
    return [...data.vehicles].slice(0, 8).map((vehicle) => ({
      plateNumber: vehicle.plateNumber,
      deltaPercent: vehicle.deltaPercent,
      suspiciousEventCount: vehicle.suspiciousEventCount,
    }));
  }, [data]);

  const topDrivers = useMemo(() => {
    if (!data) return [];
    return [...data.driverBreakdown].slice(0, 6);
  }, [data]);

  const suspiciousEvents = useMemo(() => {
    if (!data) return [];
    return [...data.suspiciousEvents].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }, [data]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex min-w-0 items-center gap-3">
          <Droplets className="h-6 w-6 text-primary" />
          <div className="min-w-0">
            <h1 className={FLEET_PAGE_TITLE}>{t('fleetFuelReport.title', 'Yakıt analitiği')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('fleetFuelReport.subtitle', 'Fiş, GPS ve alarm verilerini tek kokpitte topla')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-[13px]"
            value={weeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
          >
            {FLEET_FUEL_PERIOD_WEEKS.map((option) => (
              <option key={option} value={option}>
                {t('fleetFuelReport.periodWeeks', '{{count}} hafta', { count: option })}
              </option>
            ))}
          </select>
          <Button asChild size="sm">
            <Link href="/fleet-analytics/fuel/new">
              <Receipt className="mr-1.5 h-4 w-4" />
              {t('fuelHistory.addEntry', 'Yakıt Girişi Ekle')}
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error', 'Fehler')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Laden…')}</p>
      ) : null}

      {!error && !loading && data ? (
        <>
          <Card className={FLEET_LIST_CARD}>
            <CardContent className="grid grid-cols-2 gap-px bg-slate-100 p-0 lg:grid-cols-3 xl:grid-cols-6">
              {overviewCards.map((card) => (
                <div key={card.key} className="bg-white px-4 py-3">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle>{t('fleetFuelReport.detail.weeklyTrend', 'Haftalık L/100 km trendi')}</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                {trendChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('fleetFuelReport.detail.noTrend', 'Trend için yeterli sefer veya fiş verisi yok.')}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={12} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          value != null ? `${value.toFixed(1)} L/100 km` : '—',
                          name === 'realAvg'
                            ? t('fleetFuelReport.realAvg', 'Gerçek L/100')
                            : t('fleetFuelReport.estimatedAvg', 'Tahmini L/100'),
                        ]}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as { weekStart?: string } | undefined;
                          return row?.weekStart ?? '';
                        }}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Legend
                        formatter={(value) =>
                          value === 'realAvg'
                            ? t('fleetFuelReport.realAvg', 'Gerçek L/100')
                            : t('fleetFuelReport.estimatedAvg', 'Tahmini L/100')
                        }
                      />
                      <Line type="monotone" dataKey="realAvg" stroke="#2563eb" strokeWidth={2.5} dot={false} name="realAvg" />
                      <Line type="monotone" dataKey="estimatedAvg" stroke="#16a34a" strokeWidth={2.5} dot={false} name="estimatedAvg" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle>{t('fleetFuelReport.vehicleTable', 'Araç karşılaştırması')}</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                {vehicleChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('fleetFuelReport.noData', 'Seçilen dönemde veri yok.')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vehicleChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="plateNumber" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'deltaPercent'
                            ? `${value?.toFixed?.(1) ?? '—'} %`
                            : `${value?.toFixed?.(0) ?? '—'}`,
                          name === 'deltaPercent'
                            ? t('fleetFuelReport.detail.deltaLiters', 'Tahmin − fiş farkı')
                            : t('fleetFuelReport.summary.suspiciousEvents', 'Şüpheli olay'),
                        ]}
                      />
                      <Legend />
                      <Bar dataKey="deltaPercent" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={32} name="deltaPercent" />
                      <Bar dataKey="suspiciousEventCount" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} name="suspiciousEventCount" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle>{t('fleetFuelReport.detail.driverBreakdown', 'Sürücü kırılımı')}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {topDrivers.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {t('fleetFuelReport.detail.noDrivers', 'Bu dönemde sürücü verisi yok.')}
                  </p>
                ) : (
                  <Table className={FLEET_TABLE}>
                    <TableHeader>
                      <TableRow className={FLEET_TABLE_HEADER_ROW}>
                        <TableHead className={FLEET_TABLE_HEAD}>{t('fuelHistory.col.driver', 'Sürücü')}</TableHead>
                        <TableHead className={FLEET_TABLE_HEAD}>{t('fleetFuelReport.tripKm', 'Sefer km')}</TableHead>
                        <TableHead className={FLEET_TABLE_HEAD}>{t('fleetFuelReport.realAvg', 'Gerçek L/100')}</TableHead>
                        <TableHead className={FLEET_TABLE_HEAD}>{t('fleetFuelReport.estimatedAvg', 'Tahmini L/100')}</TableHead>
                        <TableHead className={FLEET_TABLE_HEAD}>{t('fleetFuelReport.detail.deltaLiters', 'Tahmin − fiş farkı')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className={FLEET_TABLE_BODY}>
                      {topDrivers.map((driver) => (
                        <TableRow key={driver.driverId} className={FLEET_TABLE_ROW}>
                          <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{driver.driverName}</TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>{integerFormat.format(driver.tripDistanceKm)}</TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>{driver.realLitersPer100Km != null ? driver.realLitersPer100Km.toFixed(1) : '—'}</TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>{driver.estimatedLitersPer100Km != null ? driver.estimatedLitersPer100Km.toFixed(1) : '—'}</TableCell>
                          <TableCell className={FLEET_TABLE_CELL}>{formatDelta(driver.deltaLiters)} L</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle>{t('fleetFuelReport.detail.alerts', 'Şüpheli olaylar')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {suspiciousEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('fleetFuelReport.detail.noAlerts', 'Bu dönemde şüpheli olay yok.')}
                  </p>
                ) : (
                  suspiciousEvents.slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <p className="text-sm font-medium text-slate-900">{event.plateNumber}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{event.message}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {event.type === 'fuel_theft_suspected'
                            ? t('fleetFuelReport.detail.fuelTheft', 'Yakıt hırsızlığı')
                            : t('fleetFuelReport.detail.deviation', 'Sapma')}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className={`${FLEET_LIST_CARD} mt-4`}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>{t('fuelHistory.title', 'Yakıt Geçmişi')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadFuelEntriesCsv(data.entries)}>
                <ArrowRight className="mr-1.5 h-4 w-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {data.entries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t('fuelHistory.noEntries', 'Seçilen dönemde yakıt girişi yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.vehicle', 'Araç')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.date', 'Tarih')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.driver', 'Sürücü')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.meter', 'Km Sayacı')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.volume', 'Hacim')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.total', 'Toplam')}
                      </TableHead>
                      <TableHead className={`${FLEET_TABLE_HEAD} whitespace-nowrap`}>
                        {t('fuelHistory.col.receipt', 'Fiş')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {data.entries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={`${FLEET_TABLE_ROW} ${FLEET_TABLE_ROW_CLICKABLE}`}
                        onClick={() => {
                          window.location.href = `/fleet-analytics/fuel/entries/${entry.id}`;
                        }}
                      >
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{entry.vehiclePlate ?? entry.vehicleId}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{new Date(entry.enteredAt).toLocaleString(locale)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{entry.driverName ?? '—'}</TableCell>
                        <TableCell className={`${FLEET_TABLE_CELL} tabular-nums`}>
                          {entry.odometerKm != null ? integerFormat.format(entry.odometerKm) : '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{numberFormat.format(entry.liters)} L</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{currency.format(entry.totalCost)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{entry.hasReceipt ? '✓' : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
