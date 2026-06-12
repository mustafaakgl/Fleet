'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MapPin, MoreHorizontal, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/components/ui/page-error';
import {
  dashboardApi,
  defectsApi,
  departureChecksApi,
  fleetFuelAnalyticsApi,
  trackingApi,
} from '@/lib/api';
import type {
  DashboardSummary,
  Defect,
  DepartureCheck,
  FleetFuelOverviewResponse,
  LiveTrackingItem,
  MissingDepartureCheck,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { GettingStartedPill } from '@/components/dashboard/GettingStartedPill';
import { OnboardingTasksWidget } from '@/components/dashboard/OnboardingTasksWidget';
import { RepairPriorityTrendsChart } from '@/components/dashboard/RepairPriorityTrendsChart';
import { FleetOverviewWidgets } from '@/components/dashboard/FleetOverviewWidgets';
import { FleetCostCharts } from '@/components/dashboard/FleetCostCharts';
import { RecentMessagesWidget } from '@/components/dashboard/RecentMessagesWidget';
import { WatchedExpensesWidget } from '@/components/dashboard/WatchedExpensesWidget';

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function WidgetCard({
  title,
  href,
  children,
  loading,
  className,
}: {
  title: string;
  href?: string;
  children?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('rounded-lg border-slate-200 shadow-sm', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        {href ? (
          <Link href={href} className="hover:underline">
            <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
          </Link>
        ) : (
          <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        )}
        <MoreHorizontal className="h-4 w-4 text-slate-400" aria-hidden />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? <Skeleton className="h-16 w-full" /> : children}
      </CardContent>
    </Card>
  );
}

function SplitNumbers({
  left,
  right,
}: {
  left: { label: string; value: number | string; tone: string; href: string };
  right: { label: string; value: number | string; tone: string; href: string };
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-slate-100">
      {[left, right].map((metric) => (
        <Link
          key={metric.label}
          href={metric.href}
          className="group flex flex-col items-center px-2 py-1 text-center transition hover:bg-slate-50"
        >
          <span
            className={cn(
              'text-2xl font-semibold leading-none transition group-hover:underline sm:text-3xl',
              metric.tone,
            )}
          >
            {metric.value}
          </span>
          <span className="mt-2 text-xs text-slate-500">{metric.label}</span>
        </Link>
      ))}
    </div>
  );
}

const OPEN_DEFECT_STATUSES = new Set(['offen', 'in_reparatur']);

export function MyDashboard() {
  const { t, i18n } = useTranslation();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [locations, setLocations] = useState<LiveTrackingItem[] | null>(null);
  const [defects, setDefects] = useState<Defect[] | null>(null);
  const [checksToday, setChecksToday] = useState<DepartureCheck[] | null>(null);
  const [missingChecks, setMissingChecks] = useState<MissingDepartureCheck[] | null>(null);
  const [fuel, setFuel] = useState<FleetFuelOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, locRes, defectRes, checkRes, missingRes, fuelRes] =
        await Promise.allSettled([
          dashboardApi.getSummary(),
          trackingApi.getLive(),
          defectsApi.list({ severity: 'kritisch' }),
          departureChecksApi.list({ work_date: isoToday() }),
          departureChecksApi.missingToday(),
          fleetFuelAnalyticsApi.getOverview({ from: isoDaysAgo(30), to: isoToday() }),
        ]);

      if (summaryRes.status === 'rejected') {
        throw summaryRes.reason instanceof Error
          ? summaryRes.reason
          : new Error(t('dashboard.loadError'));
      }
      setSummary(summaryRes.value);
      setLocations(locRes.status === 'fulfilled' ? locRes.value : null);
      setDefects(defectRes.status === 'fulfilled' ? defectRes.value : null);
      setChecksToday(checkRes.status === 'fulfilled' ? checkRes.value : null);
      setMissingChecks(missingRes.status === 'fulfilled' ? missingRes.value : null);
      setFuel(fuelRes.status === 'fulfilled' ? fuelRes.value : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeLocations = (locations ?? []).filter(
    (item) => item.latitude !== null && item.longitude !== null,
  );
  const criticalOpen = (defects ?? []).filter((d) => OPEN_DEFECT_STATUSES.has(d.status));
  const criticalNew = criticalOpen.filter((d) => d.status === 'offen').length;
  const criticalInRepair = criticalOpen.filter((d) => d.status === 'in_reparatur').length;

  const currencyFormat = new Intl.NumberFormat(
    i18n.language.startsWith('tr') ? 'tr-TR' : i18n.language.startsWith('en') ? 'en-US' : 'de-DE',
    { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 },
  );

  return (
    <div className="space-y-4 pb-6 sm:space-y-6 sm:pb-8">
      <GettingStartedPill />

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('dashboard.my.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('errors.retry')}
        </Button>
      </header>

      {error ? (
        <PageError error={error} titleKey="errors.dashboardLoadFailed" onRetry={() => void load()} />
      ) : (
        <>
          {/* Row 1: Onboarding tasks + repair priority trends */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-1">
              <OnboardingTasksWidget />
            </div>
            {summary?.priorityTrends ? (
              <div className="xl:col-span-2">
                <RepairPriorityTrendsChart trends={summary.priorityTrends} />
              </div>
            ) : null}
          </div>

          {/* Row 2: fleet overview split/status widgets (backend: /dashboard fleetWidgets) */}
          <FleetOverviewWidgets widgets={summary?.fleetWidgets} loading={loading} />

          {/* Row 3: live data widgets wired to sidebar features */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WidgetCard
              title={t('dashboard.widgets.vehicleLocations')}
              href="/live-tracking"
              loading={loading}
            >
              {activeLocations.length === 0 ? (
                <p className="flex h-16 items-center justify-center text-sm text-slate-400">
                  {t('dashboard.widgets.noResults')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activeLocations.slice(0, 4).map((item) => (
                    <li key={item.driverId}>
                      <Link
                        href="/live-tracking"
                        className="flex items-center justify-between gap-2 py-2 text-sm transition hover:bg-slate-50"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-slate-700">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="truncate font-medium">
                            {item.plateNumber ?? item.driverName}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {item.speedKmh !== null ? `${Math.round(item.speedKmh)} km/h` : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>

            <WidgetCard
              title={t('dashboard.widgets.criticalDefects')}
              href="/defects"
              loading={loading}
            >
              {defects === null ? (
                <p className="flex h-16 items-center justify-center text-sm text-slate-400">
                  {t('dashboard.widgets.noResults')}
                </p>
              ) : (
                <SplitNumbers
                  left={{
                    label: t('dashboard.widgets.open'),
                    value: criticalNew,
                    tone: criticalNew > 0 ? 'text-red-600' : 'text-blue-600',
                    href: '/defects?severity=kritisch&status=offen',
                  }}
                  right={{
                    label: t('dashboard.widgets.inRepair'),
                    value: criticalInRepair,
                    tone: criticalInRepair > 0 ? 'text-orange-500' : 'text-blue-600',
                    href: '/defects?severity=kritisch&status=in_reparatur',
                  }}
                />
              )}
            </WidgetCard>

            <WidgetCard
              title={t('dashboard.widgets.departureChecks')}
              href="/departure-checks"
              loading={loading}
            >
              <SplitNumbers
                left={{
                  label: t('dashboard.widgets.submitted'),
                  value: checksToday?.length ?? 0,
                  tone: 'text-emerald-600',
                  href: '/departure-checks',
                }}
                right={{
                  label: t('dashboard.widgets.missing'),
                  value: missingChecks?.length ?? 0,
                  tone: (missingChecks?.length ?? 0) > 0 ? 'text-red-600' : 'text-blue-600',
                  href: '/departure-checks',
                }}
              />
            </WidgetCard>

            <WidgetCard
              title={t('dashboard.widgets.fuelCosts')}
              href="/fleet-analytics/fuel"
              loading={loading}
            >
              {fuel === null ? (
                <p className="flex h-16 items-center justify-center text-sm text-slate-400">
                  {t('dashboard.widgets.noResults')}
                </p>
              ) : (
                <SplitNumbers
                  left={{
                    label: t('dashboard.widgets.totalCost'),
                    value: currencyFormat.format(fuel.totals.totalCost),
                    tone: 'text-emerald-600',
                    href: '/fleet-analytics/fuel',
                  }}
                  right={{
                    label: t('dashboard.widgets.liters'),
                    value: Math.round(fuel.totals.totalLiters),
                    tone: 'text-blue-600',
                    href: '/fleet-analytics/fuel',
                  }}
                />
              )}
            </WidgetCard>
          </div>

          {/* Row 4: recent messages (Fleetio "Recent Comments" equivalent) */}
          <RecentMessagesWidget />

          {/* Row 5: watched expenses */}
          <WatchedExpensesWidget />

          {/* Row 6: cost charts (financial roles only — backend omits otherwise) */}
          {summary?.costAnalytics ? <FleetCostCharts analytics={summary.costAnalytics} /> : null}
        </>
      )}
    </div>
  );
}
