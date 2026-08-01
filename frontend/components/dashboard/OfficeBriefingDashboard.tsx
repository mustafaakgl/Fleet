'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  assignmentsApi,
  dashboardApi,
  defectsApi,
  departureChecksApi,
  driversApi,
  tachographApi,
  transportRequestsApi,
} from '@/lib/api';
import { RecentMessagesWidget } from '@/components/dashboard/RecentMessagesWidget';
import { einsatzplanHref } from '@/lib/office-deep-links';
import type { DashboardSummary, Defect, MissingDepartureCheck, TransportRequest } from '@/lib/types';

function iso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isOpenCriticalDefect(defect: Defect): boolean {
  return defect.severity === 'kritisch' && (defect.status === 'offen' || defect.status === 'in_reparatur');
}

type StreamRow = {
  id: string;
  title: string;
  at: string;
  href: string;
  severity: 'critical' | 'high' | 'medium';
};

type UnassignedTaskRow = {
  id: string;
  startTime: string;
  companyName: string;
  requestedDate: string;
  cargoName: string;
};

const demoUnassignedTasks: UnassignedTaskRow[] = [
  {
    id: 'demo-1',
    startTime: '07:30',
    companyName: 'Meyer Logistik GmbH',
    requestedDate: '2026-07-13',
    cargoName: 'Tautliner',
  },
  {
    id: 'demo-2',
    startTime: '13:15',
    companyName: 'NordWind Spedition',
    requestedDate: '2026-07-14',
    cargoName: 'Kühlauflieger',
  },
];

export function OfficeBriefingDashboard() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [missingCheckins, setMissingCheckins] = useState<MissingDepartureCheck[]>([]);
  const [criticalDefects, setCriticalDefects] = useState<Defect[]>([]);
  const [overdueDdd, setOverdueDdd] = useState(0);
  const [unassigned, setUnassigned] = useState<TransportRequest[]>([]);
  const [checkinTrend, setCheckinTrend] = useState<Array<{ day: string; ratio: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        summaryRes,
        missingRes,
        defectsRes,
        badgesRes,
        transportRes,
        activeDriversRes,
      ] = await Promise.all([
        dashboardApi.getSummary(),
        departureChecksApi.missingToday(),
        defectsApi.list({ severity: 'kritisch' }),
        tachographApi.getBadges(),
        transportRequestsApi.list(),
        driversApi.list({ status: 'active', page: 1, limit: 200 }),
      ]);

      setSummary(summaryRes);
      setMissingCheckins(missingRes);
      setCriticalDefects(defectsRes.filter(isOpenCriticalDefect));
      setOverdueDdd((badgesRes.overdueCardDownloads ?? 0) + (badgesRes.overdueVuDownloads ?? 0));
      setUnassigned(
        transportRes.filter((row) => {
          const isPending = row.status === 'pending' || row.status === 'needs_review';
          const isNear = row.requestedDate === iso(0) || row.requestedDate === iso(1);
          return isPending && isNear;
        }),
      );

      const activeDrivers = activeDriversRes.total;
      const trendRows: Array<{ day: string; ratio: number }> = [];
      for (let i = 6; i >= 0; i -= 1) {
        const date = iso(-i);
        const [checks, assignments] = await Promise.all([
          departureChecksApi.list({ work_date: date }),
          assignmentsApi.list({ date }),
        ]);
        const checkCount = checks.length;
        const assigned = assignments.total ?? assignments.data.length;
        const base = Math.max(activeDrivers, assigned, 1);
        trendRows.push({ day: date.slice(5), ratio: Math.round((checkCount / base) * 100) });
      }
      setCheckinTrend(trendRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const streamRows = useMemo<StreamRow[]>(() => {
    const rows: StreamRow[] = [];
    for (const alert of summary?.criticalAlerts ?? []) {
      rows.push({
        id: alert.id,
        title: alert.message,
        at: new Date().toISOString(),
        href: '/office/queue',
        severity: alert.priority === 'critical' ? 'critical' : alert.priority === 'high' ? 'high' : 'medium',
      });
    }
    for (const defect of criticalDefects.slice(0, 4)) {
      rows.push({
        id: `defect-${defect.id}`,
        title: defect.title,
        at: defect.created_at,
        href: '/defects?severity=kritisch',
        severity: 'critical',
      });
    }
    return rows
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10);
  }, [criticalDefects, summary?.criticalAlerts]);

  const tomorrowGap = summary ? Math.max((summary.tomorrowPlanning.plannedDrivers ?? 0) - (summary.tomorrowPlanning.availableDrivers ?? 0), 0) : 0;
  const showDemoPreview = true;
  const unassignedPreview: UnassignedTaskRow[] = showDemoPreview
    ? demoUnassignedTasks
    : unassigned.slice(0, 8).map((row) => ({
        id: row.id,
        startTime: row.startTime,
        companyName: row.company?.name ?? row.companyId,
        requestedDate: row.requestedDate,
        cargoName: row.cargoName,
      }));

  const healthStrip = [
    {
      key: 'planned',
      label: t('dashboard.v3.office.health.plannedToday'),
      value: summary?.todayOperations.length ?? 0,
      href: '/assignments?tab=heute',
      scope: t('dashboard.v3.scope.today'),
    },
    {
      key: 'checkin',
      label: t('dashboard.v3.office.health.missingCheckins'),
      value: missingCheckins.length,
      href: '/departure-checks',
      scope: t('dashboard.v3.scope.today'),
    },
    {
      key: 'criticalDefects',
      label: t('dashboard.v3.office.health.criticalDefects'),
      value: criticalDefects.length,
      href: '/defects?severity=kritisch',
      scope: t('dashboard.v3.scope.today'),
    },
    {
      key: 'ddd',
      label: t('dashboard.v3.office.health.overdueDdd'),
      value: overdueDdd,
      href: '/tachograph/ddd-archive',
      scope: t('dashboard.v3.scope.today'),
    },
  ];

  if (loading && !summary) {
    return <Skeleton className="h-[440px] w-full" />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('dashboard.v3.office.title')}</h1>
      </header>

      <Button variant="outline" size="sm" asChild>
        <Link href={einsatzplanHref({ office: true, tab: 'heute', view: 'daily-overview' })}>
          {t('dashboard.openEinsatzplan')}
        </Link>
      </Button>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {healthStrip.map((item) => (
            <Link key={item.key} href={item.href} className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.scope}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
              <p className="mt-1 text-sm text-slate-600">{item.label}</p>
            </Link>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('dashboard.v3.office.checkinTrend')}</CardTitle>
          </CardHeader>
          <CardContent className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkinTrend}>
                <XAxis dataKey="day" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip formatter={(value) => [`${value}%`, t('dashboard.v3.office.checkinTrend')]} />
                <Line type="monotone" dataKey="ratio" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.office.missingCheckins')}</CardTitle>
          </CardHeader>
          <CardContent>
            {missingCheckins.length === 0 ? (
              <p className="text-sm text-emerald-700">{t('dashboard.v3.office.everyoneCheckedIn')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {missingCheckins.map((row) => (
                  <li key={row.assignment_id} className="flex items-center justify-between">
                    <span>{row.driver_name}</span>
                    <span className="text-slate-500">{row.start_time}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.office.unassignedTasks')}</CardTitle>
          </CardHeader>
          <CardContent>
            {showDemoPreview ? (
              <p className="mb-3 rounded-md border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Demo görünüm açık: aşağıdaki kartlar örnek veridir.
              </p>
            ) : null}
            <ul className="space-y-2 text-sm">
              {unassignedPreview.map((row) => (
                <li key={row.id}>
                  <Link
                    href={showDemoPreview ? '#' : `/assignments?tab=betrieb&transportId=${row.id}`}
                    aria-disabled={showDemoPreview}
                    onClick={showDemoPreview ? (event) => event.preventDefault() : undefined}
                    className={cn(
                      'flex items-center justify-between rounded-md border p-2 transition',
                      showDemoPreview ? 'cursor-default border-sky-200 bg-sky-50/70' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="min-w-0 truncate pr-2">
                      <span className="font-medium text-slate-900">{row.startTime}</span>
                      <span className="text-slate-500"> · {row.companyName}</span>
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {row.cargoName}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500">{row.requestedDate}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.office.tomorrowCapacity')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {t('dashboard.v3.office.tomorrowPlanned', { count: summary?.tomorrowPlanning.plannedDrivers ?? 0 })}
            </p>
            <p>
              {t('dashboard.v3.office.tomorrowAvailable', { count: summary?.tomorrowPlanning.availableDrivers ?? 0 })}
            </p>
            {tomorrowGap > 0 ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-800">
                {t('dashboard.v3.office.capacityGap', { count: tomorrowGap })}
              </p>
            ) : (
              <p className="text-emerald-700">{t('dashboard.v3.office.capacityOk')}</p>
            )}
            <Link href="/assignments?tab=morgen" className="text-blue-700 underline">
              {t('dashboard.v3.office.openTomorrowPlan')}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.office.criticalStream')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {streamRows.map((row) => (
                <li key={row.id}>
                  <Link href={row.href} className="flex items-center justify-between rounded-md border p-2 hover:bg-slate-50">
                    <span className={row.severity === 'critical' ? 'text-red-700' : row.severity === 'high' ? 'text-amber-700' : 'text-slate-700'}>{row.title}</span>
                    <span className="text-xs text-slate-500">{new Date(row.at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/office/queue" className="mt-3 inline-block text-blue-700 underline">
              {t('dashboard.v3.office.viewAll')}
            </Link>
          </CardContent>
        </Card>
      </div>

      <RecentMessagesWidget onlyUnread />
    </div>
  );
}
