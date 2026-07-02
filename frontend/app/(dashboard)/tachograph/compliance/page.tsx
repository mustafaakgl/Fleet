'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ClipboardCheck, HardDriveDownload, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, tachographApi } from '@/lib/api';
import {
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
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { formatFleetDateTime } from '@/lib/locale-format';
import { formatTachographDurationS } from '@/lib/tachograph-format';
import { computeAvgProcessingDays } from '@/lib/tachograph-processing';
import { infringementTypeLabelKey } from '@/lib/tachograph-infringement-meta';
import { computeRepeatCounts, getRepeatCount, topRepeatOffenders } from '@/lib/tachograph-repeat';
import { cn } from '@/lib/utils';
import { isInitialLoad } from '@/lib/is-initial-load';
import { usePageTitle } from '@/lib/use-page-title';
import {
  ChartSkeleton,
  KpiRowSkeleton,
  MatrixSkeleton,
} from '@/components/loading/page-skeletons';

const KPI_ALARM = 'tabular-nums text-[22px] font-semibold leading-none';
const KPI_PROCESS = 'tabular-nums text-lg font-semibold leading-none';

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-6 items-end gap-px" aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className="w-1.5 rounded-sm bg-slate-300"
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function cardDownloadBadgeClass(status: string): string {
  if (status === 'green') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'amber') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'red') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function remainingClass(status: string): string {
  if (status === 'critical') return 'text-red-700';
  if (status === 'warning') return 'text-amber-700';
  return 'text-slate-700';
}

function vuDaysRemainingClass(days: number): string {
  if (days <= 7) return 'text-red-700';
  if (days <= 30) return 'text-amber-700';
  return 'text-emerald-700';
}

export default function CompliancePage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.tachograph.compliance'));

  const overviewQuery = useQuery({
    queryKey: ['tachograph', 'compliance-overview'],
    queryFn: () => tachographApi.getComplianceOverview(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const badgesQuery = useQuery({
    queryKey: ['tachograph', 'badges'],
    queryFn: () => tachographApi.getBadges(),
    staleTime: 60_000,
  });

  const infringementsQuery = useQuery({
    queryKey: ['tachograph', 'infringements', 'compliance-aux'],
    queryFn: () => tachographApi.listInfringements({ limit: 200 }),
    staleTime: 30_000,
  });

  const data = overviewQuery.data;
  const allInfringements = infringementsQuery.data?.items ?? [];

  const repeatCounts = useMemo(() => computeRepeatCounts(allInfringements), [allInfringements]);
  const repeatOffenders = useMemo(
    () => topRepeatOffenders(allInfringements, { limit: 3, minCount: 3 }),
    [allInfringements],
  );
  const avgProcessingDays = useMemo(
    () => computeAvgProcessingDays(allInfringements),
    [allInfringements],
  );

  const criticalOpen = badgesQuery.data?.openCriticalInfringements ?? 0;
  const showSkeleton = isInitialLoad(overviewQuery.isLoading, Boolean(overviewQuery.data));

  const error = overviewQuery.error
    ? getApiErrorMessage(overviewQuery.error, t('tachograph.compliance.loadError'))
    : null;

  const trendChart = useMemo(
    () =>
      (data?.weeklyInfringementTrend ?? []).map((week) => ({
        label: week.weekKey.replace(/^(\d{4})-W/, 'W'),
        medium: week.medium,
        critical: week.critical,
      })),
    [data?.weeklyInfringementTrend],
  );

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <ClipboardCheck className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.tachograph.compliance')}</h1>
          <p className="text-sm text-slate-600">{t('tachograph.compliance.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void overviewQuery.refetch()}
        />
      ) : null}

      {!error && showSkeleton ? (
        <div className="space-y-4" data-testid="page-skeleton">
          <KpiRowSkeleton count={5} />
          <ChartSkeleton />
          <MatrixSkeleton rows={8} columns={7} />
        </div>
      ) : null}

      {!error && !showSkeleton && data && !data.hasDddFiles ? (
        <EmptyState
          icon={HardDriveDownload}
          title={t('tachograph.compliance.emptyTitle')}
          subtitle={t('tachograph.compliance.emptySubtitle')}
          actionLabel={t('tachograph.compliance.emptyAction')}
          onAction={() => {
            window.location.href = '/tachograph/ddd-archive';
          }}
        />
      ) : null}

      {!error && !showSkeleton && data?.hasDddFiles ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Link href="/tachograph/infringements?tab=open" className="block">
              <Card className={cn(FLEET_LIST_CARD, 'h-full hover:border-slate-300')}>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs font-medium text-slate-500">
                    {t('tachograph.compliance.kpis.openInfringements')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className={cn(KPI_ALARM, 'text-slate-900')}>{data.kpis.openInfringements}</p>
                  <p className="mt-1 text-xs text-red-700">
                    {t('tachograph.compliance.kpis.criticalSub', { count: criticalOpen })}
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-slate-500">
                  {t('tachograph.compliance.kpis.overdueCards')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className={cn(KPI_ALARM, data.kpis.overdueCardDownloads > 0 ? 'text-red-700' : 'text-slate-900')}>
                  {data.kpis.overdueCardDownloads}
                </p>
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-slate-500">
                  {t('tachograph.compliance.kpis.overdueVu')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className={cn(KPI_ALARM, data.kpis.overdueVuDownloads > 0 ? 'text-amber-700' : 'text-slate-900')}>
                  {data.kpis.overdueVuDownloads}
                </p>
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-slate-500">
                  {t('tachograph.compliance.kpis.fleetScore')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className={cn(KPI_PROCESS, 'text-slate-900')}>
                  {data.kpis.fleetComplianceScorePct}%
                  <span
                    className={cn(
                      'ml-1.5 text-xs font-medium',
                      data.kpis.fleetComplianceTrendPct >= 0 ? 'text-emerald-700' : 'text-red-700',
                    )}
                  >
                    {data.kpis.fleetComplianceTrendPct >= 0 ? '↑' : '↓'}
                    {Math.abs(data.kpis.fleetComplianceTrendPct)}%
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-slate-500">
                  {t('tachograph.compliance.kpis.avgProcessing')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {avgProcessingDays !== null ? (
                  <p className={cn(KPI_PROCESS, 'text-slate-900')}>
                    {t('tachograph.compliance.kpis.avgProcessingDays', { days: avgProcessingDays })}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">{t('tachograph.compliance.kpis.insufficientData')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle>{t('tachograph.compliance.trendTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={32} />
                    <Tooltip />
                    <Bar dataKey="medium" stackId="a" fill="#f59e0b" name={t('tachograph.severity.medium')} />
                    <Bar dataKey="critical" stackId="a" fill="#dc2626" name={t('tachograph.severity.critical')} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader>
                <CardTitle className="text-sm">{t('tachograph.compliance.repeatOffendersTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {repeatOffenders.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('tachograph.compliance.repeatOffendersEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {repeatOffenders.map((row) => (
                      <li key={`${row.driverId}-${row.type}`}>
                        <Link
                          href={`/tachograph/infringements?driverId=${row.driverId}&type=${row.type}&tab=open`}
                          className="flex items-center justify-between gap-2 text-sm hover:text-blue-700"
                        >
                          <span className="truncate">
                            {row.driverName}{' '}
                            <span className="text-slate-500">
                              {t(infringementTypeLabelKey(row.type), row.type)}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-red-700">{row.count}×</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-slate-400">{t('tachograph.compliance.repeatOffendersFootnote')}</p>
              </CardContent>
            </Card>
          </div>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('tachograph.compliance.driverMatrixTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.driver')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.cardDownload')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.openInfringements')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.driving28d')}</TableHead>
                    <TableHead className={cn(FLEET_TABLE_HEAD, 'hidden lg:table-cell')}>
                      {t('tachograph.compliance.columns.sparkline')}
                    </TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.weeklyRemaining')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.lastActivity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {data.driverMatrix.map((row) => {
                    const repeatMax = Math.max(
                      ...['daily_driving_exceeded', 'insufficient_break', 'exceeded_weekly_driving'].map((type) =>
                        getRepeatCount(repeatCounts, row.driverId, type),
                      ),
                      0,
                    );
                    return (
                      <TableRow
                        key={row.driverId}
                        className={cn(FLEET_TABLE_ROW, row.isEstimated && 'opacity-[0.55]')}
                      >
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {row.firstName} {row.lastName}
                            </span>
                            {row.isEstimated ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t('tachograph.compliance.estimated')}
                              </Badge>
                            ) : null}
                            {repeatMax >= 3 ? (
                              <Badge className="border-red-200 bg-red-50 text-[10px] text-red-700">
                                {t('tachograph.compliance.repeatBadge')}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn('border text-xs', cardDownloadBadgeClass(row.cardDownload.status))}>
                              {row.cardDownload.daysSince ?? '—'}
                              {row.cardDownload.daysSince !== null ? ` ${t('tachograph.compliance.days')}` : ''}
                            </Badge>
                            {row.cardDownload.status === 'red' ? (
                              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                <Link href="/tachograph/ddd-archive">{t('tachograph.compliance.requestDownload')}</Link>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.openInfringementCount > 0 ? (
                            <Link
                              href={`/tachograph/infringements?driverId=${row.driverId}&tab=open`}
                              className="tabular-nums font-medium text-blue-700 hover:underline"
                            >
                              {row.openInfringementCount}
                            </Link>
                          ) : (
                            <span className="tabular-nums text-slate-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                          {formatTachographDurationS(row.driving28dS, t)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'hidden lg:table-cell')}>
                          {row.isEstimated ? (
                            <span className="text-xs text-slate-400">{t('tachograph.compliance.noData')}</span>
                          ) : (
                            <Sparkline values={row.sparklineDrivingS} />
                          )}
                        </TableCell>
                        <TableCell className={cn('tabular-nums', FLEET_TABLE_CELL, remainingClass(row.weeklyRemainingStatus))}>
                          {row.weeklyRemainingS <= 0
                            ? formatTachographDurationS(0, t)
                            : formatTachographDurationS(row.weeklyRemainingS, t)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {row.lastActivityAt ? formatFleetDateTime(row.lastActivityAt) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('tachograph.compliance.vuDownloadsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.plate')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.progress')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('tachograph.compliance.columns.daysRemaining')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {data.vuDownloads.map((row) => {
                    const daysRemaining = Math.max(0, row.intervalDays - row.daysSinceLastDownload);
                    return (
                      <TableRow key={row.vehicleId ?? row.plateNumber} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{row.plateNumber}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <div className="flex min-w-[160px] items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  daysRemaining <= 7 ? 'bg-red-600' : daysRemaining <= 30 ? 'bg-amber-500' : 'bg-emerald-600',
                                )}
                                style={{ width: `${row.progressPct}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums', vuDaysRemainingClass(daysRemaining))}>
                          {t('tachograph.compliance.vuDaysRemaining', { days: daysRemaining })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
