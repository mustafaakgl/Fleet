'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardApi, finesApi, fleetFuelEntriesApi, tachographApi } from '@/lib/api';
import type { DashboardSummary } from '@/lib/types';

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function iso(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export function BossTrendDashboard() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [openInfringements, setOpenInfringements] = useState(0);
  const [costTrend, setCostTrend] = useState<Array<{ month: string; fuel: number; fines: number; damage: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, infringementsResult, finesResult, fuelEntriesResult] = await Promise.allSettled([
        dashboardApi.getSummary(),
        tachographApi.listInfringements({ status: 'open', limit: 1 }),
        finesApi.list({ from: iso(-185), to: iso(0) }),
        fleetFuelEntriesApi.list({ from: iso(-185), to: iso(0) }),
      ]);

      const summaryRes = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
      const infringementsRes = infringementsResult.status === 'fulfilled' ? infringementsResult.value : null;
      const finesRes = finesResult.status === 'fulfilled' ? finesResult.value : [];
      const fuelEntries = fuelEntriesResult.status === 'fulfilled' ? fuelEntriesResult.value : [];

      setSummary(summaryRes);
      setOpenInfringements(infringementsRes?.total ?? 0);

      const map = new Map<string, { fuel: number; fines: number; damage: number }>();
      for (const entry of fuelEntries) {
        const key = monthKey(entry.enteredAt);
        const prev = map.get(key) ?? { fuel: 0, fines: 0, damage: 0 };
        prev.fuel += entry.totalCost;
        map.set(key, prev);
      }
      for (const fine of finesRes) {
        const key = monthKey(fine.violation_at);
        const prev = map.get(key) ?? { fuel: 0, fines: 0, damage: 0 };
        prev.fines += fine.amount ?? 0;
        map.set(key, prev);
      }
      const damageSeries = summaryRes?.chartAnalytics?.monthlyAccidents ?? [];
      for (const row of damageSeries.slice(-6)) {
        const key = row.label;
        const prev = map.get(key) ?? { fuel: 0, fines: 0, damage: 0 };
        prev.damage = row.value;
        map.set(key, prev);
      }

      const sorted = Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([month, values]) => ({ month, ...values }));
      setCostTrend(sorted);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = new Intl.NumberFormat(i18n.language.startsWith('en') ? 'en-US' : i18n.language.startsWith('tr') ? 'tr-TR' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  const dailyRevenue = summary?.chartAnalytics?.dailyRevenue ?? [];
  const weekNow = dailyRevenue.slice(-7).reduce((acc, row) => acc + row.value, 0);
  const weekPrev = dailyRevenue.slice(-14, -7).reduce((acc, row) => acc + row.value, 0);

  const companyTop = useMemo(() => (summary?.revenueAnalytics?.revenueByCompany ?? []).slice(0, 6), [summary]);
  const complianceItems = useMemo(() => {
    if (!summary) return [];
    const tuvUvv = summary.vehicleHealth.filter((row) => row.issue === 'tuv_expiring_30_days' || row.issue === 'sp_expiring_30_days').length;
    return [
      { label: t('dashboard.v3.compliance.tuvUvv'), value: tuvUvv, href: '/vehicles?status=maintenance' },
      { label: t('dashboard.v3.compliance.documents'), value: summary.kpis.expiringDocuments, href: '/documents?status=expiring_soon,expired' },
      { label: t('dashboard.v3.compliance.dddOverdue'), value: 0, href: '/tachograph/ddd-archive' },
      { label: t('dashboard.v3.compliance.openInfringements'), value: openInfringements, href: '/tachograph/infringements?tab=open' },
    ];
  }, [openInfringements, summary, t]);

  const risk = summary?.driverRiskOverview ?? [];
  const riskCounts = {
    green: risk.filter((x) => x.riskLevel === 'green').length,
    yellow: risk.filter((x) => x.riskLevel === 'yellow').length,
    red: risk.filter((x) => x.riskLevel === 'red').length,
  };

  if (loading && !summary) {
    return <Skeleton className="h-[460px] w-full" />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('dashboard.v3.bossTitle')}</h1>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.revenue.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-slate-500">{t('dashboard.v3.scope.last30Days')}</p>
                <p className="text-xl font-semibold">{currency.format(dailyRevenue.reduce((acc, row) => acc + row.value, 0))}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-slate-500">{t('dashboard.v3.revenue.weekCompare')}</p>
                <p className="text-xl font-semibold">{currency.format(weekNow)}</p>
                <p className="text-xs text-slate-500">{t('dashboard.v3.revenue.prevWeek', { value: currency.format(weekPrev) })}</p>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyRevenue.slice(-30)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyTop} layout="vertical" margin={{ left: 30, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="companyName" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.vehicleUtilization.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/vehicles/assignments" className="block rounded-md border p-3 hover:bg-slate-50">
              <p className="text-slate-500">{t('dashboard.v3.scope.today')}</p>
              <p className="text-2xl font-semibold">
                {summary?.fleetWidgets?.vehicleAssignments.assigned ?? 0} / {summary?.fleetWidgets?.vehicleStatus.active ?? 0}
              </p>
            </Link>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">{t('dashboard.v3.vehicleUtilization.idleVehicles')}</p>
              <Link href="/vehicles?status=active" className="text-sm text-blue-700 underline">
                {t('dashboard.v3.vehicleUtilization.viewIdle')}
              </Link>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">{t('dashboard.v3.compliance.title')}</p>
              <ul className="space-y-1 text-sm">
                {complianceItems.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={item.value > 0 ? 'text-red-700 hover:underline' : 'text-emerald-700 hover:underline'}>
                      {item.label}: {item.value}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.costTrend.title')}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="fuel" stackId="a" fill="#0f766e" />
                <Bar dataKey="fines" stackId="a" fill="#f59e0b" />
                <Bar dataKey="damage" stackId="a" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.risk.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Link href="/telematics/driver-scores" className="rounded-md border bg-emerald-50 p-2 text-center">
                <p className="text-xs text-slate-600">{t('dashboard.v3.risk.green')}</p>
                <p className="text-xl font-semibold text-emerald-700">{riskCounts.green}</p>
              </Link>
              <Link href="/telematics/driver-scores" className="rounded-md border bg-amber-50 p-2 text-center">
                <p className="text-xs text-slate-600">{t('dashboard.v3.risk.yellow')}</p>
                <p className="text-xl font-semibold text-amber-700">{riskCounts.yellow}</p>
              </Link>
              <Link href="/telematics/driver-scores" className="rounded-md border bg-red-50 p-2 text-center">
                <p className="text-xs text-slate-600">{t('dashboard.v3.risk.red')}</p>
                <p className="text-xl font-semibold text-red-700">{riskCounts.red}</p>
              </Link>
            </div>
            <ul className="space-y-1 text-sm">
              {risk.filter((row) => row.riskLevel === 'red').slice(0, 6).map((row) => (
                <li key={row.driverId}>
                  <Link href="/telematics/driver-scores" className="text-red-700 hover:underline">{row.driverName}</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.v3.infringementTrend.title')}</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={summary?.chartAnalytics?.monthlyAccidents?.slice(-6) ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
