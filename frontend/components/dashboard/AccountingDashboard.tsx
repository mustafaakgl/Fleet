'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoicingSummaryCards } from '@/components/dashboard/InvoicingSummaryCards';
import { Skeleton } from '@/components/ui/skeleton';
import { finesApi, fleetFuelAnalyticsApi, tachographApi } from '@/lib/api';
import type { Fine } from '@/lib/types';

function monthStart(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function AccountingDashboard() {
  const { t, i18n } = useTranslation();
  const [fines, setFines] = useState<Fine[]>([]);
  const [fuelTotal, setFuelTotal] = useState(0);
  const [infringementsOpen, setInfringementsOpen] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);

      const [finesRes, fuelRes, infraRes] = await Promise.all([
        finesApi.list({ from, to }),
        fleetFuelAnalyticsApi.getOverview({ from, to }),
        tachographApi.listInfringements({ status: 'open', limit: 200 }),
      ]);
      setFines(finesRes);
      setFuelTotal(fuelRes.totals.totalCost);
      setInfringementsOpen(infraRes.total);
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

  const now = new Date();
  const currentMonth = monthStart(now);
  const prevMonth = monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const thisMonthFines = fines.filter((fine) => fine.violation_at >= currentMonth);
  const prevMonthFines = fines.filter((fine) => fine.violation_at >= prevMonth && fine.violation_at < currentMonth);
  const thisMonthTotal = thisMonthFines.reduce((acc, fine) => acc + (fine.amount ?? 0), 0);
  const prevMonthTotal = prevMonthFines.reduce((acc, fine) => acc + (fine.amount ?? 0), 0);

  const topDrivers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const fine of thisMonthFines) {
      const key = fine.driver_id ?? 'unassigned';
      const name = fine.driver?.name
        ? fine.driver.name
        : fine.driver_id
          ? `${t('dashboard.v3.accounting.driver')} #${fine.driver_id.slice(0, 8)}`
          : t('dashboard.v3.accounting.unassigned');
      const row = map.get(key) ?? { name, total: 0, count: 0 };
      row.total += fine.amount ?? 0;
      row.count += 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [thisMonthFines, t]);

  const sixMonthFineTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const fine of fines) {
      const key = monthKey(fine.violation_at);
      map.set(key, (map.get(key) ?? 0) + (fine.amount ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, total]) => ({ month, total }));
  }, [fines]);

  if (loading) {
    return <Skeleton className="h-[380px] w-full" />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('dashboard.v3.accounting.title')}</h1>
      </header>

      <InvoicingSummaryCards />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.accounting.fineSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/fines" className="block rounded-md border p-3 hover:bg-slate-50">
              <p className="text-sm text-slate-500">{t('dashboard.v3.scope.thisMonth')}</p>
              <p className="text-2xl font-semibold text-slate-900">{currency.format(thisMonthTotal)}</p>
              <p className="text-xs text-slate-500">{t('dashboard.v3.accounting.fineCount', { count: thisMonthFines.length })}</p>
              <p className="text-xs text-slate-500">{t('dashboard.v3.accounting.prevMonth', { value: currency.format(prevMonthTotal) })}</p>
            </Link>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sixMonthFineTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1 text-sm">
              {topDrivers.map((row) => (
                <li key={row.name} className="flex items-center justify-between">
                  <span>{row.name}</span>
                  <span className="font-medium">{currency.format(row.total)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.accounting.payrollQueue')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/tachograph/infringements?tab=open" className="block rounded-md border p-3 hover:bg-slate-50">
              <p className="text-sm text-slate-500">{t('dashboard.v3.scope.thisMonth')}</p>
              <p className="text-2xl font-semibold text-red-700">{infringementsOpen}</p>
            </Link>
            <Link href="/tachograph/infringements?tab=open" className="text-sm text-blue-700 underline">
              {t('dashboard.v3.accounting.openInfringementsLink')}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.accounting.fuelCost')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/fleet-analytics/fuel" className="block rounded-md border p-3 hover:bg-slate-50">
              <p className="text-sm text-slate-500">{t('dashboard.v3.scope.thisMonth')}</p>
              <p className="text-2xl font-semibold text-slate-900">{currency.format(fuelTotal)}</p>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.v3.accounting.deadlines')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link href="/vehicles?status=maintenance" className="block rounded-md border p-3 hover:bg-slate-50">
              {t('dashboard.v3.accounting.deadlineHint')}
            </Link>
            <Link href="/documents?status=expiring_soon,expired" className="text-blue-700 underline">
              {t('dashboard.v3.accounting.openDocuments')}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
