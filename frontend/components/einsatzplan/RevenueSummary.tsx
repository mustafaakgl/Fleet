'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getTodayDate, getTomorrowDate, useFleetData } from '@/context/FleetDataContext';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

export function RevenueSummary() {
  const { t } = useTranslation();
  const { revenueData, calculateDailyRevenue, calculateMonthlyRevenue } = useFleetData();

  const todayRevenue = calculateDailyRevenue(getTodayDate()) || revenueData.todayRevenue;
  const tomorrowForecast = calculateDailyRevenue(getTomorrowDate()) || revenueData.tomorrowForecast;
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return calculateMonthlyRevenue(now.getMonth() + 1, now.getFullYear()) || revenueData.monthlyRevenue;
  }, [calculateMonthlyRevenue, revenueData.monthlyRevenue]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('revenue.title')}</h2>
        <p className="text-sm text-slate-600">{t('revenue.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t('revenue.today')} value={currency(todayRevenue)} tone="text-emerald-700" />
        <MetricCard label={t('revenue.tomorrow')} value={currency(tomorrowForecast)} tone="text-blue-700" />
        <MetricCard label={t('revenue.monthly')} value={currency(monthlyRevenue)} tone="text-slate-900" />
        <MetricCard label={t('revenue.lost')} value={currency(revenueData.lostRevenueThisMonth)} tone="text-red-700" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RevenueTable
          title={t('revenue.byCompany')}
          rows={revenueData.revenueByCompany.map((item) => ({ label: item.name, value: item.amount }))}
        />
        <RevenueTable
          title={t('revenue.byVehicle')}
          rows={revenueData.revenueByVehicle.map((item) => ({ label: item.name, value: item.amount }))}
        />
        <RevenueTable
          title={t('revenue.byDriver')}
          rows={revenueData.revenueByDriver.map((item) => ({ label: item.name, value: item.amount }))}
        />
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

function RevenueTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2.5">{t('revenue.colName')}</th>
              <th className="border-b border-slate-200 px-3 py-2.5 text-right">{t('revenue.colRevenue')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="px-3 py-2.5 font-medium text-slate-900">{row.label}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{currency(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
