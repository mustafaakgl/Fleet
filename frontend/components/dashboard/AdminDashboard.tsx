'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ComplianceFleetStrip } from '@/components/dashboard/ComplianceFleetStrip';
import { BossTrendDashboard } from '@/components/dashboard/BossTrendDashboard';
import {
  auditApi,
  dashboardApi,
  defectsApi,
  departureChecksApi,
  devicesApi,
  tachographApi,
  trackingApi,
  usersApi,
} from '@/lib/api';
import type { DeviceRow } from '@/lib/types';

const OPEN_DEFECT_STATUSES = new Set(['offen', 'in_reparatur']);

type UrgentItem = {
  key: string;
  label: string;
  value: number;
  href: string;
};

type OpsState = {
  usersTotal: number;
  usersInactive: number;
  devices: DeviceRow[];
  liveVehicles: number;
  failedLogins24h: number;
};

function UrgentCard({ item }: { item: UrgentItem }) {
  const tone = item.value > 0 ? 'text-red-700' : 'text-emerald-700';
  return (
    <Link
      href={item.href}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
    >
      <p className={`text-2xl font-semibold ${tone}`}>{item.value}</p>
      <p className="mt-1 text-sm text-slate-600">{item.label}</p>
    </Link>
  );
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const [urgent, setUrgent] = useState<UrgentItem[] | null>(null);
  const [ops, setOps] = useState<OpsState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [
        summaryResult,
        defectsResult,
        missingResult,
        badgesResult,
        usersResult,
        devicesResult,
        liveResult,
        auditResult,
      ] = await Promise.allSettled([
        dashboardApi.getSummary(),
        defectsApi.list({ severity: 'kritisch' }),
        departureChecksApi.missingToday(),
        tachographApi.getBadges(),
        usersApi.list(),
        devicesApi.list(),
        trackingApi.getLive(),
        auditApi.listPage({ action: 'auth.login_failed', dateFrom: since, limit: 1 }),
      ]);

      const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
      const defects = defectsResult.status === 'fulfilled' ? defectsResult.value : [];
      const missing = missingResult.status === 'fulfilled' ? missingResult.value : [];
      const badges = badgesResult.status === 'fulfilled' ? badgesResult.value : null;
      const users = usersResult.status === 'fulfilled' ? usersResult.value.data : [];
      const devices = devicesResult.status === 'fulfilled' ? devicesResult.value : [];
      const live = liveResult.status === 'fulfilled' ? liveResult.value : [];
      const failedLogins = auditResult.status === 'fulfilled' ? auditResult.value.total : 0;

      const openCriticalDefects = defects.filter((d) => OPEN_DEFECT_STATUSES.has(d.status)).length;
      const overdueDdd = (badges?.overdueCardDownloads ?? 0) + (badges?.overdueVuDownloads ?? 0);
      const openInfringements = badges?.openCriticalInfringements ?? 0;

      setUrgent([
        {
          key: 'missing-assignments',
          label: t('dashboard.v3.admin.urgent.missingAssignments'),
          value: summary?.tomorrowPlanning.missingAssignments ?? 0,
          href: '/assignments?panel=tagesplanung&view=daily-overview',
        },
        {
          key: 'critical-defects',
          label: t('dashboard.v3.admin.urgent.criticalDefects'),
          value: openCriticalDefects,
          href: '/defects?severity=kritisch',
        },
        {
          key: 'missing-checkins',
          label: t('dashboard.v3.admin.urgent.missingCheckins'),
          value: missing.length,
          href: '/departure-checks',
        },
        {
          key: 'overdue-ddd',
          label: t('dashboard.v3.admin.urgent.overdueDdd'),
          value: overdueDdd,
          href: '/tachograph/ddd-archive',
        },
        {
          key: 'open-infringements',
          label: t('dashboard.v3.admin.urgent.openInfringements'),
          value: openInfringements,
          href: '/tachograph/infringements?tab=open',
        },
      ]);

      const activeLive = live.filter(
        (item) => item.latitude !== null && item.longitude !== null,
      ).length;

      setOps({
        usersTotal: users.length,
        usersInactive: users.filter((user) => user.status !== 'active').length,
        devices,
        liveVehicles: activeLive,
        failedLogins24h: failedLogins,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const deviceCounts = {
    online: (ops?.devices ?? []).filter((row) => row.status === 'online').length,
    offline: (ops?.devices ?? []).filter((row) => row.status === 'offline').length,
    never: (ops?.devices ?? []).filter((row) => row.status === 'never').length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {t('dashboard.v3.admin.title')}
        </h1>
      </header>

      <BossTrendDashboard hideHeader />

      <ComplianceFleetStrip />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {t('dashboard.v3.admin.urgent.title')}
        </h2>
        {loading && !urgent ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(urgent ?? []).map((item) => (
              <UrgentCard key={item.key} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {t('dashboard.v3.admin.ops.title')}
        </h2>
        {loading && !ops ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  {t('dashboard.v3.admin.ops.users')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-4 text-sm">
                <Link href="/users" className="block hover:underline">
                  <span className="text-2xl font-semibold text-slate-900">{ops?.usersTotal ?? 0}</span>{' '}
                  <span className="text-slate-500">{t('dashboard.v3.admin.ops.usersActive')}</span>
                </Link>
                <Link
                  href="/users?status=inactive"
                  className={`block hover:underline ${(ops?.usersInactive ?? 0) > 0 ? 'text-amber-700' : 'text-slate-500'}`}
                >
                  {t('dashboard.v3.admin.ops.usersInactive', { count: ops?.usersInactive ?? 0 })}
                </Link>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  {t('dashboard.v3.admin.ops.devices')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-4 text-sm">
                <Link href="/devices" className="block hover:underline">
                  <span className="text-emerald-700">{deviceCounts.online} {t('dashboard.v3.admin.ops.devicesOnline')}</span>
                  {' · '}
                  <span className={deviceCounts.offline > 0 ? 'text-red-700' : 'text-slate-500'}>
                    {deviceCounts.offline} {t('dashboard.v3.admin.ops.devicesOffline')}
                  </span>
                  {' · '}
                  <span className="text-slate-500">{deviceCounts.never} {t('dashboard.v3.admin.ops.devicesNever')}</span>
                </Link>
                <Link href="/live-tracking" className="block text-slate-500 hover:underline">
                  {t('dashboard.v3.admin.ops.liveVehicles', { count: ops?.liveVehicles ?? 0 })}
                </Link>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  {t('dashboard.v3.admin.ops.audit')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-4 text-sm">
                <p className={(ops?.failedLogins24h ?? 0) > 0 ? 'text-red-700' : 'text-slate-500'}>
                  {t('dashboard.v3.admin.ops.failedLogins24h', { count: ops?.failedLogins24h ?? 0 })}
                </p>
                <Link href="/audit" className="block text-blue-700 hover:underline">
                  {t('dashboard.v3.admin.ops.viewAudit')}
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
