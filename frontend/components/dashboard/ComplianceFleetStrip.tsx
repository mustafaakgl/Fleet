'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiRowSkeleton } from '@/components/loading/page-skeletons';
import { tachographApi } from '@/lib/api';
import { isInitialLoad } from '@/lib/is-initial-load';
import { cn } from '@/lib/utils';

const KPI = 'tabular-nums text-[22px] font-semibold leading-none sm:text-[22px]';

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="hidden h-8 items-end gap-px xl:flex" aria-hidden data-testid="compliance-sparkline">
      {values.map((value, index) => (
        <span
          key={index}
          className="w-1.5 rounded-sm bg-slate-300"
          style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function TrendDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return <Minus className="h-4 w-4 text-slate-400" aria-hidden />;
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center text-sm text-emerald-700" title={`+${delta}%`}>
        <ArrowUp className="h-4 w-4" />
        {delta}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-sm text-red-700" title={`${delta}%`}>
      <ArrowDown className="h-4 w-4" />
      {Math.abs(delta)}%
    </span>
  );
}

function StripCard({
  title,
  href,
  children,
  className,
  testId,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <Card className={cn('rounded-lg border-slate-200 shadow-sm', className)} data-testid={testId}>
      <CardHeader className="space-y-0 px-4 pb-2 pt-4">
        <Link href={href} className="hover:underline">
          <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Link href={href} className="block transition hover:opacity-90">
          {children}
        </Link>
      </CardContent>
    </Card>
  );
}

export function ComplianceFleetStrip() {
  const { t } = useTranslation();
  const summaryQuery = useQuery({
    queryKey: ['tachograph', 'dashboard-summary'],
    queryFn: () => tachographApi.getDashboardSummary(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isInitialLoad(summaryQuery.isLoading, Boolean(summaryQuery.data))) {
    return <KpiRowSkeleton count={4} className="xl:grid-cols-4" data-testid="compliance-fleet-strip" />;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return null;
  }

  const data = summaryQuery.data;
  const sparkValues = data.complianceScoreTrend.map((point) => point.scorePct);
  const criticalCount = data.openCriticalCount;
  const overdueTotal = data.overdueDownloadsTotal;

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      data-testid="compliance-fleet-strip"
    >
      <StripCard
        title={t('dashboard.complianceStrip.scoreTitle')}
        href="/tachograph/compliance"
        testId="compliance-strip-score"
      >
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className={cn(KPI, 'text-slate-900')}>{data.complianceScorePct}%</p>
            <TrendDelta delta={data.complianceScoreTrendDelta} />
          </div>
          <Sparkline values={sparkValues} />
        </div>
      </StripCard>

      <StripCard
        title={t('dashboard.complianceStrip.criticalTitle')}
        href="/tachograph/infringements?status=open"
        testId="compliance-strip-critical"
        className={criticalCount === 0 ? 'border-emerald-200 bg-emerald-50/40' : undefined}
      >
        <p
          className={cn(
            KPI,
            criticalCount === 0 ? 'text-emerald-700' : 'text-red-700',
          )}
        >
          {criticalCount === 0
            ? t('dashboard.complianceStrip.criticalClean')
            : criticalCount}
        </p>
        {criticalCount === 0 ? (
          <p className="mt-1 text-xs text-emerald-700">{t('dashboard.complianceStrip.criticalCleanHint')}</p>
        ) : null}
      </StripCard>

      {data.driversOutOfTimeToday > 0 ? (
        <StripCard
          title={t('dashboard.complianceStrip.outOfTimeTitle')}
          href="/tachograph/remaining-driving-time"
          testId="compliance-strip-out-of-time"
        >
          <p className={cn(KPI, 'text-amber-700')}>{data.driversOutOfTimeToday}</p>
        </StripCard>
      ) : null}

      <StripCard
        title={t('dashboard.complianceStrip.overdueDownloadsTitle')}
        href="/tachograph/ddd-archive"
        testId="compliance-strip-overdue"
      >
        <p className={cn(KPI, overdueTotal > 0 ? 'text-amber-700' : 'text-slate-700')}>
          {overdueTotal}
        </p>
      </StripCard>
    </div>
  );
}
