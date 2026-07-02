'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, HardDriveDownload, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getApiErrorMessage, tachographApi } from '@/lib/api';
import { FLEET_LIST_CARD, FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import { formatTachographDurationS } from '@/lib/tachograph-format';
import type { TachographRemainingDriver } from '@/lib/types';
import { cn } from '@/lib/utils';
import { isInitialLoad } from '@/lib/is-initial-load';
import { usePageTitle } from '@/lib/use-page-title';
import { CardGridSkeleton } from '@/components/loading/page-skeletons';

function remainingRadialColor(remainingS: number): string {
  if (remainingS < 3600) return '#dc2626';
  if (remainingS < 2 * 3600) return '#f59e0b';
  return '#059669';
}

function statusBadgeClass(status: TachographRemainingDriver['currentStatus']): string {
  if (status === 'driving') return 'border-blue-200 bg-blue-50 text-blue-800';
  if (status === 'rest') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function ProgressBar({
  usedS,
  limitS,
  label,
  t,
}: {
  usedS: number;
  limitS: number;
  label: string;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const pct = limitS > 0 ? Math.min(100, Math.round((usedS / limitS) * 100)) : 0;
  const barClass = pct >= 100 ? 'bg-red-600' : pct >= 85 ? 'bg-amber-500' : 'bg-slate-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="tabular-nums">
          {formatTachographDurationS(usedS, t)} / {formatTachographDurationS(limitS, t)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DriverRemainingCard({
  driver,
  t,
}: {
  driver: TachographRemainingDriver;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const dailyLimitS = driver.todayDrivingS + driver.todayRemainingDrivingS;
  const fillPct = dailyLimitS > 0 ? Math.round((driver.todayRemainingDrivingS / dailyLimitS) * 100) : 0;
  const radialFill = remainingRadialColor(driver.todayRemainingDrivingS);
  const breakSoon = driver.nextMandatoryBreakInS > 0 && driver.nextMandatoryBreakInS < 30 * 60;

  return (
    <Link href={`/tachograph/compliance?driverId=${driver.driverId}`} className="block">
      <Card
        className={cn(
          FLEET_LIST_CARD,
          'h-full transition-colors hover:border-slate-300',
          driver.isStale && 'opacity-[0.55]',
        )}
      >
        <CardHeader className="pb-2 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              {driver.firstName} {driver.lastName}
            </CardTitle>
            <Badge className={cn('text-[10px]', statusBadgeClass(driver.currentStatus))}>
              {t(`tachograph.remaining.status.${driver.currentStatus}`)}
            </Badge>
          </div>
          {driver.isStale ? (
            <p className="text-[10px] text-slate-500">
              {t('tachograph.remaining.staleFootnote', { days: driver.daysSinceDdd ?? '—' })}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="relative mx-auto h-36 w-full max-w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="72%"
                outerRadius="100%"
                data={[{ name: 'remaining', value: fillPct, fill: radialFill }]}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#f1f5f9' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  'tabular-nums text-lg font-semibold',
                  driver.todayRemainingDrivingS < 3600
                    ? 'text-red-700'
                    : driver.todayRemainingDrivingS < 2 * 3600
                      ? 'text-amber-700'
                      : 'text-slate-900',
                )}
              >
                {formatTachographDurationS(driver.todayRemainingDrivingS, t)}
              </span>
              <span className="text-[10px] text-slate-500">{t('tachograph.remaining.todayRemaining')}</span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600">
            {breakSoon ? <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
            {t('tachograph.remaining.nextBreak', {
              duration: formatTachographDurationS(driver.nextMandatoryBreakInS, t),
            })}
          </p>

          <ProgressBar
            usedS={driver.weekUsedS}
            limitS={driver.weekLimitS}
            label={t('tachograph.remaining.weekProgress')}
            t={t}
          />
          <ProgressBar
            usedS={driver.twoWeekUsedS}
            limitS={driver.twoWeekLimitS}
            label={t('tachograph.remaining.twoWeekProgress')}
            t={t}
          />

          <p className="text-[11px] text-slate-500">
            {t('tachograph.remaining.rightsRow', {
              extensionsUsed: driver.extensionsUsed,
              extensionsMax: driver.extensionsMax,
              reducedUsed: driver.reducedRestUsed,
              reducedMax: driver.reducedRestMax,
            })}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function RemainingDrivingTimePage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.tachograph.remainingDrivingTime'));

  const query = useQuery({
    queryKey: ['tachograph', 'remaining'],
    queryFn: () => tachographApi.getRemaining(),
    staleTime: 30_000,
  });

  const data = query.data;
  const error = query.error
    ? getApiErrorMessage(query.error, t('tachograph.remaining.loadError'))
    : null;

  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const warnings = data?.warnings ?? [];
  const showSkeleton = isInitialLoad(query.isLoading, Boolean(query.data));

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <Gauge className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.tachograph.remainingDrivingTime')}</h1>
          <p className="text-sm text-slate-600">{t('tachograph.remaining.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!error && showSkeleton ? (
        <div data-testid="page-skeleton">
          <CardGridSkeleton count={6} />
        </div>
      ) : null}

      {!error && !showSkeleton && data && !data.hasActivityData ? (
        <EmptyState
          icon={HardDriveDownload}
          title={t('tachograph.remaining.emptyTitle')}
          subtitle={t('tachograph.remaining.emptySubtitle')}
          actionLabel={t('tachograph.remaining.emptyAction')}
          onAction={() => {
            window.location.href = '/tachograph/ddd-archive';
          }}
        />
      ) : null}

      {!error && !showSkeleton && data?.hasActivityData ? (
        <>
          {warnings.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              {warnings.map((warning) => (
                <p key={warning.driverId} className="text-sm text-amber-900">
                  ⚠️{' '}
                  {t('tachograph.remaining.warningLine', {
                    name: warning.driverName,
                    planned: formatTachographDurationS(warning.plannedTodayS, t),
                    remaining: formatTachographDurationS(warning.remainingDrivingS, t),
                  })}{' '}
                  {warning.assignmentId ? (
                    <Link
                      href={`/assignments?panel=tagesplanung&view=daily-overview`}
                      className="font-medium underline"
                    >
                      {t('tachograph.remaining.warningLink')}
                    </Link>
                  ) : null}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {drivers.map((driver) => (
              <DriverRemainingCard key={driver.driverId} driver={driver} t={t} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
