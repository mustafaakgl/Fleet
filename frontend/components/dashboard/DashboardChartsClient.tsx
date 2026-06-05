'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardChartAnalytics, DashboardChartPoint } from '@/lib/types';

type ChartPeriod = 'daily' | 'monthly';

function formatDayLabel(label: string) {
  const [, month, day] = label.split('-');
  if (!month || !day) return label;
  return `${day}.${month}`;
}

function formatMonthLabel(label: string) {
  const [year, month] = label.split('-');
  if (!year || !month) return label;
  return `${month}/${year.slice(2)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <button
        type="button"
        onClick={() => onChange('daily')}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
          period === 'daily'
            ? 'bg-white text-blue-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {t('dashboard.periodDaily')}
      </button>
      <button
        type="button"
        onClick={() => onChange('monthly')}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
          period === 'monthly'
            ? 'bg-white text-blue-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {t('dashboard.periodMonthly')}
      </button>
    </div>
  );
}

type FilterableChartCardProps = {
  title: string;
  period: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  dailyData: DashboardChartPoint[];
  monthlyData: DashboardChartPoint[];
  valueFormatter?: (value: number) => string;
  barColor: string;
};

function FilterableChartCard({
  title,
  period,
  onPeriodChange,
  dailyData,
  monthlyData,
  valueFormatter,
  barColor,
}: FilterableChartCardProps) {
  const data = period === 'daily' ? dailyData : monthlyData;
  const formatLabel = period === 'daily' ? formatDayLabel : formatMonthLabel;

  const chartData = useMemo(
    () => data.map((point) => ({ ...point, shortLabel: formatLabel(point.label) })),
    [data, formatLabel],
  );

  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        <PeriodToggle period={period} onChange={onPeriodChange} />
      </CardHeader>
      <CardContent className="h-72 pt-0">
        {chartData.every((row) => row.value === 0) ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">—</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                allowDecimals={!valueFormatter}
                width={valueFormatter ? 56 : 32}
                tickFormatter={(v) => (valueFormatter ? formatCurrency(Number(v)) : String(v))}
              />
              <Tooltip
                formatter={(value: number) =>
                  valueFormatter ? valueFormatter(Number(value)) : String(value)
                }
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ?? '';
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="value" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardChartsClient({ analytics }: { analytics: DashboardChartAnalytics }) {
  const { t } = useTranslation();
  const [revenuePeriod, setRevenuePeriod] = useState<ChartPeriod>('daily');
  const [accidentsPeriod, setAccidentsPeriod] = useState<ChartPeriod>('daily');

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.chartsTitle')}</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FilterableChartCard
          title={t('dashboard.chartRevenue')}
          period={revenuePeriod}
          onPeriodChange={setRevenuePeriod}
          dailyData={analytics.dailyRevenue}
          monthlyData={analytics.monthlyRevenue}
          valueFormatter={formatCurrency}
          barColor="#2563eb"
        />
        <FilterableChartCard
          title={t('dashboard.chartAccidents')}
          period={accidentsPeriod}
          onPeriodChange={setAccidentsPeriod}
          dailyData={analytics.dailyAccidents}
          monthlyData={analytics.monthlyAccidents}
          barColor="#dc2626"
        />
      </div>
    </section>
  );
}
