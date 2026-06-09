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

function OperationMobileCard({
  row,
  onClick,
}: {
  row: DashboardTodayOperation;
  onClick: () => void;
}) {
  const { t } = useTranslation(['common', 'einsatzplan']);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{row.driverName}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {row.vehiclePlate} · {row.companyName}
          </p>
        </div>
        <Badge className={cn('shrink-0', statusColor(row.status))}>{row.status}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('planning.colStartTime', { ns: 'einsatzplan' })}
          </dt>
          <dd className="font-medium text-slate-700">{row.startTime}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('planning.colCargo', { ns: 'einsatzplan' })}
          </dt>
          <dd className="truncate font-medium text-slate-700">{cell(row.cargoName)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('planning.colPickup', { ns: 'einsatzplan' })}
          </dt>
          <dd className="line-clamp-2 text-slate-600">{cell(row.pickupAddress)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('planning.colDelivery', { ns: 'einsatzplan' })}
          </dt>
          <dd className="line-clamp-2 text-slate-600">{cell(row.deliveryAddress)}</dd>
        </div>
      </dl>
    </button>
  );
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
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{t('dashboard.dailyEinsatzplan')}</h2>
          <p className="text-sm text-slate-500">{t('dashboard.dailyEinsatzplanSub')}</p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-full shrink-0 sm:w-auto">
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
          <>
          <div className="divide-y divide-slate-100 md:hidden">
            {rows.map((row) => (
              <OperationMobileCard
                key={row.id}
                row={row}
                onClick={() => router.push(einsatzplanLink)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
          </>
        )}
      </Card>
    </section>
  );
}
