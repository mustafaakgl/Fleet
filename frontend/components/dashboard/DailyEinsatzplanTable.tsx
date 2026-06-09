'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { einsatzplanHref } from '@/lib/office-deep-links';
import type { DashboardTodayOperation } from '@/lib/types';
import {
  FLEET_LIST_CARD,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { cn, statusColor } from '@/lib/utils';

function cell(value?: string | null) {
  const text = value?.trim();
  return text ? text : '—';
}

export function DailyEinsatzplanTable({
  rows,
  loading,
  officeMode = false,
}: {
  rows?: DashboardTodayOperation[];
  loading?: boolean;
  officeMode?: boolean;
}) {
  const { t } = useTranslation(['common', 'einsatzplan']);
  const router = useRouter();
  const einsatzplanLink = officeMode
    ? einsatzplanHref({ office: true, tab: 'heute', view: 'daily-overview' })
    : '/assignments?panel=tagesplanung&view=daily-overview';

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.dailyEinsatzplan')}</h2>
          <p className="text-sm text-slate-500">{t('dashboard.dailyEinsatzplanSub')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={einsatzplanLink}>{t('dashboard.openEinsatzplan')}</Link>
        </Button>
      </div>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarDays}
              title={t('dashboard.noAssignmentsToday')}
              subtitle={t('dashboard.noAssignmentsTodaySub')}
              actionLabel={t('dashboard.createAssignment')}
              onAction={() => router.push('/assignments/new')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colDriver', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colVehicle', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colCompany', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colStartTime', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colCargo', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colPickup', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colDelivery', { ns: 'einsatzplan' })}
                  </TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>
                    {t('planning.colStatus', { ns: 'einsatzplan' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={FLEET_TABLE_ROW_CLICKABLE}
                    onClick={() => router.push(einsatzplanLink)}
                  >
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{row.driverName}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{row.vehiclePlate}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{row.companyName}</TableCell>
                    <TableCell className={cn(FLEET_TABLE_CELL_MUTED, 'whitespace-nowrap')}>
                      {row.startTime}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <div>{cell(row.cargoName)}</div>
                      {row.cargoOwner ? (
                        <div className="text-[11px] text-slate-500">{row.cargoOwner}</div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(FLEET_TABLE_CELL_MUTED, 'max-w-[220px] truncate')}
                      title={row.pickupAddress ?? undefined}
                    >
                      {cell(row.pickupAddress)}
                    </TableCell>
                    <TableCell
                      className={cn(FLEET_TABLE_CELL_MUTED, 'max-w-[220px] truncate')}
                      title={row.deliveryAddress ?? undefined}
                    >
                      {cell(row.deliveryAddress)}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <Badge className={statusColor(row.status)}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </section>
  );
}
