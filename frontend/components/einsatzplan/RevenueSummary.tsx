'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTodayDate, getTomorrowDate, useFleetData } from '@/context/FleetDataContext';
import { dashboardApi } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function RevenueSummary() {
  const { t } = useTranslation();
  const { assignments, drivers, calculateDailyRevenue, calculateMonthlyRevenue } = useFleetData();
  const [apiAnalytics, setApiAnalytics] = useState<Awaited<ReturnType<typeof dashboardApi.getRevenueAnalytics>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void dashboardApi
      .getRevenueAnalytics(getTodayDate())
      .then((data) => {
        if (!cancelled) {
          setApiAnalytics(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiAnalytics(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const monthKey = monthKeyFromDate(now);

  const derived = useMemo(() => {
    const activeMonthRows = assignments.filter(
      (item) =>
        item.date.startsWith(monthKey)
        && (item.status === 'Planned' || item.status === 'In Progress')
        && item.availability === 'Available',
    );

    const byCompany = new Map<string, number>();
    const byVehicle = new Map<string, number>();
    const byDriver = new Map<string, number>();
    for (const row of activeMonthRows) {
      byCompany.set(row.company, (byCompany.get(row.company) ?? 0) + row.expectedRevenue);
      byVehicle.set(row.vehicle, (byVehicle.get(row.vehicle) ?? 0) + row.expectedRevenue);
      byDriver.set(row.driverId, (byDriver.get(row.driverId) ?? 0) + row.expectedRevenue);
    }

    const lostRevenueThisMonth = assignments
      .filter(
        (item) =>
          item.date.startsWith(monthKey)
          && (item.status === 'Unavailable' || item.availability !== 'Available'),
      )
      .reduce((total, item) => total + item.expectedRevenue, 0);

    return {
      revenueByCompany: [...byCompany.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      revenueByVehicle: [...byVehicle.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      revenueByDriver: [...byDriver.entries()]
        .map(([driverId, amount]) => ({
          name: drivers.find((driver) => driver.id === driverId)?.name ?? driverId,
          amount,
        }))
        .sort((a, b) => b.amount - a.amount),
      lostRevenueThisMonth,
    };
  }, [assignments, drivers, monthKey]);

  const todayRevenue = apiAnalytics?.todayRevenue ?? calculateDailyRevenue(getTodayDate());
  const tomorrowForecast = calculateDailyRevenue(getTomorrowDate());
  const monthlyRevenue =
    apiAnalytics?.monthlyRevenue ?? calculateMonthlyRevenue(now.getMonth() + 1, now.getFullYear());

  const revenueByCompany = (apiAnalytics?.revenueByCompany ?? []).map((row) => ({
    name: row.companyName,
    amount: row.revenue,
  }));
  const companyRows =
    revenueByCompany.length > 0 ? revenueByCompany : derived.revenueByCompany;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('revenue.title')}</h2>
        <p className="text-sm text-slate-600">{t('revenue.subtitle')}</p>
        {loading ? <p className="mt-1 text-xs text-slate-500">{t('common.loading')}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t('revenue.today')} value={currency(todayRevenue)} tone="text-brand-primary" />
        <MetricCard label={t('revenue.tomorrow')} value={currency(tomorrowForecast)} tone="text-brand-primary" />
        <MetricCard label={t('revenue.monthly')} value={currency(monthlyRevenue)} tone="text-slate-900" />
        <MetricCard
          label={t('revenue.lost')}
          value={currency(derived.lostRevenueThisMonth)}
          tone="text-red-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RevenueTable title={t('revenue.byCompany')} rows={companyRows} />
        <RevenueTable title={t('revenue.byVehicle')} rows={derived.revenueByVehicle} />
        <RevenueTable title={t('revenue.byDriver')} rows={derived.revenueByDriver} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function RevenueTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
      <div className="border-b border-slate-200 px-3 py-2">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className={FLEET_RAW_TABLE}>
          <thead className={FLEET_RAW_THEAD}>
            <tr>
              <th className={FLEET_RAW_TH}>{t('revenue.colName')}</th>
              <th className={cn(FLEET_RAW_TH, 'text-right')}>{t('revenue.colRevenue')}</th>
            </tr>
          </thead>
          <tbody className={FLEET_RAW_TBODY}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  {t('common.noRecords')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.name} className={FLEET_RAW_TR}>
                  <td className={FLEET_RAW_TD_PRIMARY}>{row.name}</td>
                  <td className={cn(FLEET_RAW_TD, 'text-right font-semibold')}>{currency(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
