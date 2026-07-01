'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, WifiOff, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, telematicsApi } from '@/lib/api';
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
import type { TelematicsVehicleHealthItem, TelematicsVehicleHealthStatus } from '@/lib/types';
import { formatFleetDateTime } from '@/lib/locale-format';

const EMPTY_VEHICLE_ITEMS: TelematicsVehicleHealthItem[] = [];
const EMPTY_OPEN_DTCS: Array<{
  plateNumber: string;
  code: string;
  description: string | null;
  severity: 'medium' | 'critical';
  occurredAt: string;
}> = [];

function healthBadgeClass(status: TelematicsVehicleHealthStatus): string {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'warn') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function metric(value: number | null, suffix = ''): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1)}${suffix}`;
}

function statusKey(status: TelematicsVehicleHealthStatus): string {
  if (status === 'ok') return 'telematics.vehicleHealth.status.ok';
  if (status === 'warn') return 'telematics.vehicleHealth.status.warn';
  if (status === 'critical') return 'telematics.vehicleHealth.status.critical';
  return 'telematics.vehicleHealth.status.ok';
}

export default function VehicleHealthPage() {
  const { t } = useTranslation();
  const healthQuery = useQuery({
    queryKey: ['telematics', 'vehicle-health'],
    queryFn: () => telematicsApi.getVehicleHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = healthQuery.data?.vehicles ?? EMPTY_VEHICLE_ITEMS;
  const openDtcs = healthQuery.data?.openDtcs ?? EMPTY_OPEN_DTCS;
  const summary = healthQuery.data?.summary;
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.health === b.health ? a.plateNumber.localeCompare(b.plateNumber) : a.health.localeCompare(b.health),
      ),
    [items],
  );
  const openDtcCount = useMemo(() => openDtcs.length, [openDtcs]);

  const error = healthQuery.error
    ? getApiErrorMessage(healthQuery.error, t('telematics.vehicleHealth.loadError'))
    : null;

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
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
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.ok')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-emerald-700">{summary.ok}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.vehicleHealth.cards.warn')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-amber-700">{summary.warn}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">
                {t('telematics.vehicleHealth.cards.critical')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-700">{summary.critical}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">
                {t('telematics.vehicleHealth.cards.openDtc')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{openDtcCount}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!error && !healthQuery.isLoading && summary && sortedItems.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t('telematics.vehicleHealth.emptyTitle')}
          subtitle={t('telematics.vehicleHealth.emptySubtitle')}
        />
      ) : null}

      {!error && !healthQuery.isLoading && sortedItems.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('telematics.vehicleHealth.table.title')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('telematics.vehicleHealth.table.plate')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('telematics.vehicleHealth.table.health')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('telematics.vehicleHealth.table.lastUpdate')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('telematics.vehicleHealth.table.voltage')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>
                      {t('telematics.vehicleHealth.table.coolant')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.vehicleHealth.table.km')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {sortedItems.map((item: TelematicsVehicleHealthItem) => (
                    <TableRow key={item.vehicleId} className={FLEET_TABLE_ROW}>
                      <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{item.plateNumber}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={`border text-xs ${healthBadgeClass(item.health)}`}>
                          {t(statusKey(item.health))}
                        </Badge>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>
                        {formatFleetDateTime(item.latest.recordedAt)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{metric(item.latest.voltage, 'V')}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{metric(item.latest.coolantTemp, 'C')}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{metric(item.latest.odometerKm, ' km')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('telematics.vehicleHealth.openDtc.title')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {openDtcs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('telematics.vehicleHealth.openDtc.empty')}</p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('telematics.vehicleHealth.openDtc.plate')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('telematics.vehicleHealth.openDtc.code')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('telematics.vehicleHealth.openDtc.description')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('telematics.vehicleHealth.openDtc.severity')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {openDtcs.map((dtc) => (
                      <TableRow
                        key={`${dtc.plateNumber}-${dtc.code}-${dtc.occurredAt}`}
                        className={FLEET_TABLE_ROW}
                      >
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{dtc.plateNumber}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{dtc.code}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{dtc.description ?? '-'}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Badge
                            className={`border text-xs ${
                              dtc.severity === 'critical'
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-amber-100 text-amber-700 border-amber-200'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {dtc.severity === 'critical' ? <AlertTriangle className="h-3 w-3" /> : null}
                              {t(
                                dtc.severity === 'critical'
                                  ? 'telematics.vehicleHealth.openDtc.critical'
                                  : 'telematics.vehicleHealth.openDtc.medium',
                              )}
                            </span>
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
