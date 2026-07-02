'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ChevronDown, ChevronRight, Flag, WifiOff, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, telematicsApi } from '@/lib/api';
import { coolantTempClass, voltageClass } from '@/lib/driver-score-intensity';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
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
import { formatFleetDateTime } from '@/lib/locale-format';
import type {
  TelematicsVehicleHealthItem,
  TelematicsVehicleHealthSeries24h,
  TelematicsVehicleHealthSeries7d,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const KPI_PRIMARY = 'tabular-nums text-[22px] font-semibold leading-none';
const KPI_SECONDARY = 'tabular-nums text-lg font-semibold leading-none';

function deviceDotClass(status: TelematicsVehicleHealthItem['deviceStatus']): string {
  if (status === 'online') return 'bg-emerald-500';
  if (status === 'silent') return 'bg-red-500';
  return 'bg-slate-300';
}

function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}${suffix}`;
}

function VehicleHealthDetailCharts({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const series24h = useQuery({
    queryKey: ['telematics', 'vehicle-health-series', vehicleId, '24h'],
    queryFn: () => telematicsApi.getVehicleHealthSeries(vehicleId, '24h'),
  });
  const series7d = useQuery({
    queryKey: ['telematics', 'vehicle-health-series', vehicleId, '7d'],
    queryFn: () => telematicsApi.getVehicleHealthSeries(vehicleId, '7d'),
  });

  const data24h = series24h.data as TelematicsVehicleHealthSeries24h | undefined;
  const data7d = series7d.data as TelematicsVehicleHealthSeries7d | undefined;

  const speedChartData = useMemo(() => {
    if (!data24h) return [];
    return data24h.speed.map((point, index) => ({
      at: point.at,
      kmh: point.kmh,
      coolant: data24h.coolant[index]?.celsius ?? null,
      voltage: data24h.voltage[index]?.volts ?? null,
    }));
  }, [data24h]);

  const fuelChartData = useMemo(() => {
    if (!data7d) return [];
    return data7d.fuelLevel.map((point) => ({
      at: point.at,
      pct: point.pct,
      isEstimated: point.isEstimated,
    }));
  }, [data7d]);

  if (series24h.isLoading || series7d.isLoading) {
    return <p className="py-4 text-sm text-slate-500">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-6 border-t border-slate-100 bg-slate-50/60 px-4 py-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-56">
          <p className="mb-2 text-sm font-medium text-slate-700">
            {t('telematics.vehicleHealth.charts.speed24h')}
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={speedChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="at"
                tickFormatter={(value) => formatFleetDateTime(value).split(' ')[1] ?? ''}
                tick={{ fontSize: 10, fill: '#64748b' }}
                minTickGap={24}
              />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} domain={[0, 'auto']} />
              {data24h?.ignitionPeriods.map((period, index) => (
                <ReferenceArea
                  key={`${period.start}-${index}`}
                  x1={period.start}
                  x2={period.end}
                  fill="#94a3b8"
                  fillOpacity={0.15}
                  ifOverflow="extendDomain"
                />
              ))}
              <Tooltip
                labelFormatter={(value) => formatFleetDateTime(String(value))}
                formatter={(value: number) => [`${value?.toFixed?.(1) ?? '—'} km/h`, t('telematics.vehicleHealth.charts.speed')]}
              />
              <Area type="monotone" dataKey="kmh" fill="#93c5fd" fillOpacity={0.35} stroke="#2563eb" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="h-56">
          <p className="mb-2 text-sm font-medium text-slate-700">
            {t('telematics.vehicleHealth.charts.coolantVoltage24h')}
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={speedChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="at"
                tickFormatter={(value) => formatFleetDateTime(value).split(' ')[1] ?? ''}
                tick={{ fontSize: 10, fill: '#64748b' }}
                minTickGap={24}
              />
              <YAxis yAxisId="coolant" tick={{ fontSize: 10, fill: '#64748b' }} width={36} domain={['auto', 'auto']} />
              <YAxis yAxisId="voltage" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} width={36} domain={['auto', 'auto']} />
              <Tooltip labelFormatter={(value) => formatFleetDateTime(String(value))} />
              <Line yAxisId="coolant" type="monotone" dataKey="coolant" stroke="#dc2626" dot={false} strokeWidth={2} name="°C" />
              <Line yAxisId="voltage" type="monotone" dataKey="voltage" stroke="#7c3aed" dot={false} strokeWidth={2} name="V" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="h-56">
        <p className="mb-2 text-sm font-medium text-slate-700">{t('telematics.vehicleHealth.charts.fuel7d')}</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={fuelChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="at"
              tickFormatter={(value) => formatFleetDateTime(value).slice(0, 10)}
              tick={{ fontSize: 10, fill: '#64748b' }}
              minTickGap={32}
            />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} domain={[0, 100]} />
            <Tooltip labelFormatter={(value) => formatFleetDateTime(String(value))} />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#16a34a"
              dot={(props) => {
                const { cx, cy, payload, index } = props;
                const refuel = data7d?.refuelPoints.some(
                  (point) => Math.abs(new Date(point.at).getTime() - new Date(payload.at).getTime()) < 3_600_000,
                );
                const suspicious = data7d?.suspiciousDrops.some(
                  (point) => Math.abs(new Date(point.at).getTime() - new Date(payload.at).getTime()) < 3_600_000,
                );
                if (!refuel && !suspicious) return <circle key={index} cx={cx} cy={cy} r={0} />;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={suspicious ? '#dc2626' : '#22c55e'}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              }}
              strokeWidth={2}
              strokeOpacity={0.85}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VehicleHealthDetailPanel({
  item,
}: {
  item: TelematicsVehicleHealthItem;
}) {
  const { t } = useTranslation();

  return (
    <>
      <VehicleHealthDetailCharts vehicleId={item.vehicleId} />
      <div className="border-t border-slate-100 px-4 py-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">{t('telematics.vehicleHealth.openDtc.title')}</h4>
        {item.activeDtcs.length === 0 ? (
          <p className="text-sm text-slate-500">{t('telematics.vehicleHealth.openDtc.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {item.activeDtcs.map((dtc) => (
              <li
                key={`${dtc.code}-${dtc.occurredAt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-mono font-semibold text-slate-900">{dtc.code}</span>
                  {dtc.description ? (
                    <span className="ml-2 text-slate-600">{dtc.description}</span>
                  ) : null}
                  <span className="ml-2 text-xs text-slate-400">{formatFleetDateTime(dtc.occurredAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {dtc.severity === 'critical' ? (
                    <Badge className="border-red-200 bg-red-50 text-red-700">{t('telematics.vehicleHealth.openDtc.critical')}</Badge>
                  ) : null}
                  {dtc.severity === 'critical' ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/service-history?vehicle_id=${item.vehicleId}&open_create=1&task=${encodeURIComponent(`${dtc.code} ${dtc.description ?? ''}`.trim())}`}
                      >
                        {t('telematics.vehicleHealth.openServiceRecord')}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function VehicleHealthPage() {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ['telematics', 'vehicle-health'],
    queryFn: () => telematicsApi.getVehicleHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = healthQuery.data?.items ?? [];
  const summary = healthQuery.data?.summary;
  const error = healthQuery.error
    ? getApiErrorMessage(healthQuery.error, t('telematics.vehicleHealth.loadError'))
    : null;

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const order = { silent: 0, offline: 1, online: 2 };
        const statusDiff = order[a.deviceStatus] - order[b.deviceStatus];
        if (statusDiff !== 0) return statusDiff;
        return a.plateNumber.localeCompare(b.plateNumber);
      }),
    [items],
  );

  return (
    <div className={FLEET_PAGE}>
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.telematics.vehicleHealth')}</h1>
          <p className="text-sm text-slate-600">{t('telematics.vehicleHealth.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void healthQuery.refetch()}
        />
      ) : null}

      {!error && healthQuery.isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}

      {!error && !healthQuery.isLoading && summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.online')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={KPI_PRIMARY}>
                {summary.online}
                <span className="text-base font-normal text-slate-400"> / {summary.devicesTotal}</span>
              </p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.criticalDtc')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn(KPI_PRIMARY, 'text-red-700')}>{summary.activeCriticalDtc}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.maintenanceDue')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn(KPI_SECONDARY, 'text-amber-700')}>{summary.maintenanceDueSoon}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.silent')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn(KPI_PRIMARY, 'text-red-700')}>{summary.silentDevices}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!error && !healthQuery.isLoading && summary && !summary.hasAnyDevice ? (
        <EmptyState
          icon={Wrench}
          title={t('telematics.vehicleHealth.noDevicesTitle')}
          subtitle={t('telematics.vehicleHealth.noDevicesSubtitle')}
          actionLabel={t('nav.devices')}
          onAction={() => {
            window.location.href = '/devices';
          }}
        />
      ) : null}

      {!error && !healthQuery.isLoading && sortedItems.length > 0 ? (
        <Card className={FLEET_LIST_CARD}>
          <CardHeader>
            <CardTitle>{t('telematics.vehicleHealth.table.title')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'w-8')} />
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.status')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.fuel')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.engine')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.voltage')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.km')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.cards.openDtc')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.maintenance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {sortedItems.map((item) => {
                  const telemetry = item.telemetry;
                  const isOffline = item.deviceStatus === 'offline';
                  const expanded = expandedId === item.vehicleId;
                  const maintenance = item.nextMaintenance;
                  const maintenanceOverdue =
                    (maintenance?.remainingKm !== null && maintenance?.remainingKm !== undefined && maintenance.remainingKm <= 0)
                    || (maintenance?.remainingDays !== null && maintenance?.remainingDays !== undefined && maintenance.remainingDays <= 0);

                  return (
                    <Fragment key={item.vehicleId}>
                      <TableRow
                        className={cn(
                          FLEET_TABLE_ROW,
                          'cursor-pointer',
                          isOffline && 'bg-slate-50 text-slate-500',
                        )}
                        onClick={() => setExpandedId(expanded ? null : item.vehicleId)}
                      >
                        <TableCell className={FLEET_TABLE_CELL}>
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <div>
                            <p className="font-medium">{item.plateNumber}</p>
                            <p className="text-xs text-slate-500">
                              {item.brand} {item.model}
                            </p>
                            {isOffline && item.lastSeenAt ? (
                              <p className="text-xs text-slate-400">
                                {t('telematics.vehicleHealth.lastSeen', { time: formatFleetDateTime(item.lastSeenAt) })}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <span className="inline-flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', deviceDotClass(item.deviceStatus))} />
                            {t(`telematics.vehicleHealth.deviceStatus.${item.deviceStatus}`)}
                          </span>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <div className="flex min-w-[88px] items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full bg-blue-500"
                                style={{ width: `${Math.min(100, telemetry?.fuelLevelPct ?? 0)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-xs">{formatMetric(telemetry?.fuelLevelPct, '%')}</span>
                            {item.fuelDropFlag ? (
                              <span title={t('telematics.vehicleHealth.fuelDropTooltip')}>
                                <Flag className="h-3.5 w-3.5 text-red-600" />
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, coolantTempClass(telemetry?.coolantTemp ?? null))}>
                          <span className="tabular-nums text-sm">
                            {telemetry?.rpm ?? '—'} · {formatMetric(telemetry?.coolantTemp, '°C')}
                          </span>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, voltageClass(telemetry?.voltage ?? null))}>
                          <span className="tabular-nums">{formatMetric(telemetry?.voltage, ' V')}</span>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                          {telemetry?.odometerKm !== null && telemetry?.odometerKm !== undefined
                            ? Math.round(telemetry.odometerKm).toLocaleString()
                            : '—'}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {item.activeDtcCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Badge
                                className={cn(
                                  'border text-xs',
                                  item.criticalDtcCount > 0
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-700',
                                )}
                              >
                                {item.activeDtcCount}
                              </Badge>
                              {item.criticalDtcCount > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {maintenance ? (
                            <div className="min-w-[120px]">
                              <p className={cn('text-xs', maintenanceOverdue && 'font-medium text-red-700')}>
                                {maintenanceOverdue
                                  ? t('telematics.vehicleHealth.maintenanceOverdue')
                                  : maintenance.remainingKm !== null
                                    ? t('telematics.vehicleHealth.maintenanceKm', { km: Math.round(maintenance.remainingKm) })
                                    : maintenance.remainingDays !== null
                                      ? t('telematics.vehicleHealth.maintenanceDays', { days: maintenance.remainingDays })
                                      : maintenance.name}
                              </p>
                              {maintenance.remainingKm !== null && maintenance.intervalKm ? (
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={cn('h-full', maintenanceOverdue ? 'bg-red-500' : 'bg-amber-500')}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, ((maintenance.intervalKm - maintenance.remainingKm) / maintenance.intervalKm) * 100))}%`,
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={9} className="p-0">
                            <VehicleHealthDetailPanel item={item} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
