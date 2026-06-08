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
import { statusColor } from '@/lib/utils';

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

      <Card className="overflow-hidden">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('planning.colDriver', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colVehicle', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colCompany', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colStartTime', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colCargo', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colPickup', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colDelivery', { ns: 'einsatzplan' })}</TableHead>
                  <TableHead>{t('planning.colStatus', { ns: 'einsatzplan' })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(einsatzplanLink)}
                  >
                    <TableCell className="font-medium text-slate-900">{row.driverName}</TableCell>
                    <TableCell>{row.vehiclePlate}</TableCell>
                    <TableCell>{row.companyName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.startTime}</TableCell>
                    <TableCell>
                      <div>{cell(row.cargoName)}</div>
                      {row.cargoOwner ? (
                        <div className="text-xs text-slate-500">{row.cargoOwner}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={row.pickupAddress ?? undefined}>
                      {cell(row.pickupAddress)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={row.deliveryAddress ?? undefined}>
                      {cell(row.deliveryAddress)}
                    </TableCell>
                    <TableCell>
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
