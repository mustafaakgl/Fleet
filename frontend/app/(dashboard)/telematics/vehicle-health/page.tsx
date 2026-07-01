'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, WifiOff, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, telematicsApi } from '@/lib/api';
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
import type { TelematicsVehicleHealthItem, TelematicsVehicleHealthStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function healthBadgeClass(status: TelematicsVehicleHealthStatus): string {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'warning') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function metric(value: number | null, suffix = ''): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1)}${suffix}`;
}

function statusKey(status: TelematicsVehicleHealthStatus): string {
  if (status === 'healthy') return 'telematics.vehicleHealth.status.healthy';
  if (status === 'warning') return 'telematics.vehicleHealth.status.warning';
  if (status === 'critical') return 'telematics.vehicleHealth.status.critical';
  return 'telematics.vehicleHealth.status.offline';
}

export default function VehicleHealthPage() {
  const { t } = useTranslation();
  const healthQuery = useQuery({
    queryKey: ['telematics', 'vehicle-health'],
    queryFn: () => telematicsApi.getVehicleHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = healthQuery.data?.items ?? [];
  const summary = healthQuery.data?.summary;
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.health === b.health ? a.plateNumber.localeCompare(b.plateNumber) : a.health.localeCompare(b.health))),
    [items],
  );

  const error = healthQuery.error
    ? getApiErrorMessage(healthQuery.error, t('telematics.vehicleHealth.loadError'))
    : null;

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.total')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-slate-900">{summary.totalVehicles}</p></CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.healthy')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-emerald-700">{summary.healthy}</p></CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.warning')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-amber-700">{summary.warning}</p></CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.critical')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-red-700">{summary.critical}</p></CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.activeDtc')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-slate-900">{summary.activeDtcTotal}</p></CardContent>
          </Card>
        </div>
      ) : null}

      {!error && !healthQuery.isLoading && summary && sortedItems.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('telematics.vehicleHealth.emptyTitle')} subtitle={t('telematics.vehicleHealth.emptySubtitle')} />
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
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.vehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.driver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.health')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.fuel')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.coolant')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.voltage')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.dtc')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.lastTelemetry')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {sortedItems.map((item: TelematicsVehicleHealthItem) => (
                  <TableRow key={item.vehicleId} className={FLEET_TABLE_ROW}>
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{item.plateNumber}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{item.driverName ?? '-'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Badge className={`border text-xs ${healthBadgeClass(item.health)}`}>
                        {t(statusKey(item.health))}
                      </Badge>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{metric(item.fuelLevelPct, '%')}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{metric(item.coolantTemp, 'C')}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{metric(item.voltage, 'V')}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <div className="flex items-center gap-2">
                        <span>{item.activeDtcCount}</span>
                        {item.criticalDtcCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            {item.criticalDtcCount}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>
                      {item.lastTelemetryAt ? formatDate(item.lastTelemetryAt) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
