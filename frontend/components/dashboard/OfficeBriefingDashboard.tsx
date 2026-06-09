'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  MapPinned,
  MessageSquare,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/components/ui/page-error';
import { dashboardApi, trackingApi } from '@/lib/api';
import { fetchOfficeQueueItems } from '@/lib/office-queue';
import { einsatzplanHref, officeQueueHref } from '@/lib/office-deep-links';
import type { DashboardCriticalAlert, DashboardSummary } from '@/lib/types';
import { FleetOverviewWidgets } from '@/components/dashboard/FleetOverviewWidgets';
import { FleetCostCharts } from '@/components/dashboard/FleetCostCharts';
import { RepairPriorityTrendsChart } from '@/components/dashboard/RepairPriorityTrendsChart';
import { WatchedExpensesWidget } from '@/components/dashboard/WatchedExpensesWidget';
import { DailyEinsatzplanTable } from '@/components/dashboard/DailyEinsatzplanTable';

function alertClass(priority: DashboardCriticalAlert['priority']) {
  if (priority === 'critical') return 'border-red-300 bg-red-50 text-red-800';
  if (priority === 'high') return 'border-orange-300 bg-orange-50 text-orange-800';
  if (priority === 'medium') return 'border-yellow-300 bg-yellow-50 text-yellow-800';
  return 'border-blue-300 bg-blue-50 text-blue-800';
}

function alertHref(alert: DashboardCriticalAlert): string {
  if (alert.relatedEntityType === 'document') return '/documents?status=expiring_soon,expired';
  if (alert.relatedEntityType === 'accident') return '/cargo-damage?status=reported,under_review';
  if (alert.relatedEntityType === 'vehicle_handover') {
    return einsatzplanHref({ office: true, tab: 'betrieb', view: 'vehicle-handovers' });
  }
  if (alert.relatedEntityType === 'company_email') {
    return einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' });
  }
  if (alert.relatedEntityType === 'assignment') {
    return einsatzplanHref({ office: true, tab: 'heute', view: 'daily-overview' });
  }
  return '/dashboard';
}

const QUICK_ACTIONS = [
  {
    href: officeQueueHref(),
    labelKey: 'office.quick.queue',
    icon: ClipboardList,
    color: 'bg-rose-50 text-rose-700 border-rose-100',
  },
  {
    href: einsatzplanHref({ office: true, tab: 'heute', view: 'daily-overview' }),
    labelKey: 'office.quick.einsatzplan',
    icon: CalendarDays,
    color: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  {
    href: '/live-tracking',
    labelKey: 'office.quick.tracking',
    icon: MapPinned,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  {
    href: '/requests',
    labelKey: 'office.quick.requests',
    icon: ClipboardList,
    color: 'bg-violet-50 text-violet-700 border-violet-100',
  },
  {
    href: einsatzplanHref({ office: true, tab: 'betrieb', view: 'morning-checkins' }),
    labelKey: 'office.quick.checkins',
    icon: Sun,
    color: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  {
    href: '/documents?status=expiring_soon,expired',
    labelKey: 'office.quick.documents',
    icon: FileText,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  {
    href: '/messenger',
    labelKey: 'office.quick.messenger',
    icon: MessageSquare,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
] as const;

export function OfficeBriefingDashboard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showMore, setShowMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null);
  const [gpsActiveCount, setGpsActiveCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, queueItems, liveDrivers] = await Promise.all([
        dashboardApi.getSummary(),
        fetchOfficeQueueItems(t).catch(() => []),
        trackingApi.getLive({ staleAfterSec: 120, includeOffline: false }).catch(() => []),
      ]);
      setSummary(data);
      setOpenTaskCount(queueItems.length);
      setGpsActiveCount(liveDrivers.filter((item) => item.status === 'online').length);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e);
      setSummary(null);
      setOpenTaskCount(null);
      setGpsActiveCount(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const officeKpis = summary
    ? [
        {
          id: 'docs',
          label: t('dashboard.expiringDocuments'),
          value: summary.kpis.expiringDocuments,
          href: '/documents?status=expiring_soon,expired',
          urgent: summary.kpis.expiringDocuments > 0,
        },
        {
          id: 'email',
          label: t('dashboard.unsentCompanyEmails'),
          value: summary.kpis.unsentCompanyEmails,
          href: einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' }),
          urgent: summary.kpis.unsentCompanyEmails > 0,
        },
        {
          id: 'sick',
          label: t('dashboard.sickDrivers'),
          value: summary.kpis.sickDrivers,
          href: '/drivers?status=sick',
          urgent: summary.kpis.sickDrivers > 0,
        },
        {
          id: 'missing',
          label: t('dashboard.missingAssignments'),
          value: summary.tomorrowPlanning.missingAssignments,
          href: einsatzplanHref({ office: true, tab: 'morgen' }),
          urgent: summary.tomorrowPlanning.missingAssignments > 0,
        },
        {
          id: 'gps',
          label: t('office.briefing.gpsSharing'),
          value: gpsActiveCount ?? 0,
          href: '/live-tracking',
          urgent: false,
        },
      ]
    : [];

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">{t('office.briefing.eyebrow')}</p>
          <h1 className="text-2xl font-bold text-slate-900">{t('office.briefing.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{todayLabel}</p>
          {openTaskCount !== null && openTaskCount > 0 ? (
            <Link
              href={officeQueueHref()}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-200"
            >
              {t('office.briefing.openTasks', { count: openTaskCount })}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated ? (
            <span className="text-xs text-slate-500">
              {t('office.briefing.updated', {
                time: lastUpdated.toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('errors.retry')}
          </Button>
        </div>
      </header>

      {error ? (
        <PageError error={error} titleKey="errors.dashboardLoadFailed" onRetry={() => void load()} />
      ) : null}

      {!error ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t('dashboard.criticalAlerts')}
            </h2>
            {loading ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : !summary || summary.criticalAlerts.length === 0 ? (
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-4 text-sm text-emerald-800">
                  {t('office.briefing.noAlerts')}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={officeQueueHref()}>{t('office.briefing.viewQueue')}</Link>
                </Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {summary.criticalAlerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={alertHref(alert)}
                    className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition hover:shadow ${alertClass(alert.priority)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {alert.message}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t('office.briefing.quickActions')}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {QUICK_ACTIONS.map(({ href, labelKey, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center text-xs font-medium transition hover:shadow-sm ${color}`}
                >
                  <Icon className="h-5 w-5" />
                  {t(labelKey)}
                </Link>
              ))}
            </div>
          </section>

          <FleetOverviewWidgets widgets={summary?.fleetWidgets} loading={loading} />

          <WatchedExpensesWidget />

          {summary?.priorityTrends ? (
            <RepairPriorityTrendsChart trends={summary.priorityTrends} />
          ) : null}

          {summary?.costAnalytics ? <FleetCostCharts analytics={summary.costAnalytics} /> : null}

          <DailyEinsatzplanTable
            rows={summary?.todayOperations}
            loading={loading}
            officeMode
          />

          {!loading && summary ? (
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {officeKpis.map((kpi) => (
                <button
                  key={kpi.id}
                  type="button"
                  onClick={() => router.push(kpi.href)}
                  className={`rounded-xl border p-3 text-left transition hover:shadow-md ${
                    kpi.urgent ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {kpi.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{kpi.value}</p>
                </button>
              ))}
            </section>
          ) : null}

          <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.tomorrowPlanning')}</h2>
            {loading ? (
              <Skeleton className="h-16" />
            ) : summary ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    <strong>{summary.tomorrowPlanning.plannedDrivers}</strong> {t('dashboard.plannedDrivers')}
                  </span>
                  <span>
                    <strong>{summary.tomorrowPlanning.availableDrivers}</strong>{' '}
                    {t('dashboard.availableDrivers')}
                  </span>
                  <span className={summary.tomorrowPlanning.missingAssignments > 0 ? 'text-amber-700' : ''}>
                    <strong>{summary.tomorrowPlanning.missingAssignments}</strong>{' '}
                    {t('dashboard.missingAssignments')}
                  </span>
                </div>
                <Button asChild>
                  <Link href={einsatzplanHref({ office: true, tab: 'morgen' })}>
                    {t('dashboard.openEinsatzplan')}
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('office.briefing.showMore')}
              <ChevronDown className={`h-4 w-4 transition ${showMore ? 'rotate-180' : ''}`} />
            </button>
            {showMore && summary ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat
                  label={t('dashboard.activeDrivers')}
                  value={summary.kpis.activeDrivers}
                  icon={Users}
                />
                <MiniStat
                  label={t('dashboard.vehiclesInUse')}
                  value={summary.kpis.vehiclesInUse}
                  icon={CalendarDays}
                />
                <MiniStat
                  label={t('dashboard.openAccidents')}
                  value={summary.kpis.openAccidents}
                  icon={AlertTriangle}
                />
                <MiniStat
                  label={t('dashboard.driversVacation')}
                  value={summary.kpis.driversOnVacation}
                  icon={Users}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <Icon className="h-5 w-5 text-slate-400" />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
