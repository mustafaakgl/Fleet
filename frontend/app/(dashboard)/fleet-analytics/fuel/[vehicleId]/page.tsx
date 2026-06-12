'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Droplets, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi, fleetFuelAnalyticsApi, getApiErrorMessage, vehiclesApi } from '@/lib/api';
import {
  FLEET_FUEL_PERIOD_WEEKS,
  fleetFuelDateRange,
  formatWeekLabel,
} from '@/lib/fleet-fuel-report';
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
} from '@/lib/fleet-table';
import type { Driver, FleetVehicleFuelAnalyticsResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function driverLabel(driver: Driver | undefined, driverId: string): string {
  if (!driver) return driverId.slice(0, 8);
  return `${driver.first_name} ${driver.last_name}`.trim();
}

export default function FleetVehicleFuelAnalyticsPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = use(params);
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(8);
  const [plateNumber, setPlateNumber] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [data, setData] = useState<FleetVehicleFuelAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void vehiclesApi
      .getById(vehicleId)
      .then((vehicle) => setPlateNumber(vehicle.plate_number))
      .catch(() => setPlateNumber(null));
    void driversApi
      .list({ limit: 500, status: 'active' })
      .then((page) => setDrivers(page.data))
      .catch(() => setDrivers([]));
  }, [vehicleId]);

  const driverNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      map.set(driver.id, driverLabel(driver, driver.id));
    }
    return map;
  }, [drivers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = fleetFuelDateRange(weeks);
      const result = await fleetFuelAnalyticsApi.getVehicleAnalytics(vehicleId, range);
      setData(result);
    } catch (e) {
      setData(null);
      setError(getApiErrorMessage(e, t('fleetFuelReport.loadError', 'Yakıt analitiği yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [t, vehicleId, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: 'realAvg',
        label: t('fleetFuelReport.summary.realAvg', 'Gerçek L/100 km'),
        value: data.avgLitersPer100Km != null ? `${data.avgLitersPer100Km.toFixed(1)}` : '—',
      },
      {
        key: 'estimatedAvg',
        label: t('fleetFuelReport.summary.estimatedAvg', 'Tahmini L/100 km'),
        value:
          data.avgEstimatedLitersPer100Km != null
            ? `${data.avgEstimatedLitersPer100Km.toFixed(1)}`
            : '—',
      },
      {
        key: 'real',
        label: t('fleetFuelReport.summary.realLiters', 'Gerçek litre (fiş)'),
        value: `${data.totalLiters.toFixed(1)} L`,
      },
      {
        key: 'estimated',
        label: t('fleetFuelReport.summary.estimatedLiters', 'Tahmini litre (GPS)'),
        value: `${data.totalEstimatedLiters.toFixed(1)} L`,
      },
      {
        key: 'delta',
        label: t('fleetFuelReport.detail.deltaLiters', 'Tahmin − fiş farkı'),
        value:
          data.estimatedVsRealDeltaLiters != null
            ? `${data.estimatedVsRealDeltaLiters >= 0 ? '+' : ''}${data.estimatedVsRealDeltaLiters.toFixed(1)} L`
            : '—',
      },
      {
        key: 'cost',
        label: t('fleetFuelReport.summary.fuelCost', 'Yakıt maliyeti'),
        value: `${data.totalCost.toFixed(2)} €`,
      },
    ];
  }, [data, t]);

  const trendChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return [];
    return data.weeklyTrend.map((week) => ({
      weekStart: week.weekStart,
      shortLabel: formatWeekLabel(week.weekStart),
      realAvg: week.realLitersPer100Km,
      estimatedAvg: week.estimatedLitersPer100Km,
    }));
  }, [data]);

  const titlePlate = plateNumber ?? vehicleId;

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/fleet-analytics/fuel"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('fleetFuelReport.backToOverview', 'Tüm araçlar')}
          </Link>
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={weeks}
          onChange={(event) => setWeeks(Number(event.target.value))}
        >
          {FLEET_FUEL_PERIOD_WEEKS.map((option) => (
            <option key={option} value={option}>
              {t('fleetFuelReport.periodWeeks', '{{count}} hafta', { count: option })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Droplets className="h-6 w-6 text-primary" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>
            {t('fleetFuelReport.detail.title', 'Yakıt analitiği — {{plate}}', {
              plate: titlePlate,
            })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('fleetFuelReport.detail.subtitle', 'Gerçek fiş verisi vs GPS tahmini')}
          </p>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <Card key={card.key} className={FLEET_LIST_CARD}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetFuelReport.detail.weeklyTrend', 'Haftalık L/100 km trendi')}</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {trendChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetFuelReport.detail.noTrend', 'Trend için yeterli sefer veya fiş verisi yok.')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      interval="preserveStartEnd"
                      minTickGap={12}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        value != null ? `${Number(value).toFixed(1)} L/100` : '—',
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
                    <Bar
                      dataKey="realAvg"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      dataKey="estimatedAvg"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetFuelReport.detail.driverBreakdown', 'Sürücü kırılımı')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.driverBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetFuelReport.detail.noDrivers', 'Bu dönemde sürücü verisi yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.driver', 'Sürücü')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.tripKm', 'Sefer km')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.realAvg', 'Gerçek L/100')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.estimatedAvg', 'Tahmini L/100')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.realLiters', 'Gerçek L')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.estimatedLiters', 'Tahmini L')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {data.driverBreakdown.map((row) => (
                      <TableRow key={row.driverId} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          {driverNames.get(row.driverId) ?? row.driverId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{row.tripDistanceKm.toFixed(0)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.realLitersPer100Km?.toFixed(1) ?? '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.estimatedLitersPer100Km?.toFixed(1) ?? '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{row.realLiters.toFixed(1)}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.estimatedLiters.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetFuelReport.detail.entries', 'Yakıt fişleri')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetFuelReport.detail.noEntries', 'Bu dönemde yakıt fişi yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.entryDate', 'Tarih')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.driver', 'Sürücü')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.liters', 'Litre')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.summary.fuelCost', 'Yakıt maliyeti')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.odometer', 'Km')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetFuelReport.detail.fullTank', 'Tam depo')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {data.entries.map((entry) => (
                      <TableRow key={entry.id} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          {formatDate(entry.enteredAt)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {driverNames.get(entry.driverId) ?? entry.driverId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{entry.liters.toFixed(1)} L</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {entry.totalCost.toFixed(2)} {entry.currency}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          {entry.odometerKm != null ? `${entry.odometerKm.toFixed(0)} km` : '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          {entry.isFullTank
                            ? t('fleetFuelReport.detail.fullTankYes', 'Evet')
                            : t('fleetFuelReport.detail.fullTankNo', 'Hayır')}
                        </TableCell>
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
