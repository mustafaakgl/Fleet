'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardCostAnalytics, DashboardCostChartPoint } from '@/lib/types';
import { monthRangeFromKey } from '@/lib/service-record-categories';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function serviceHistoryHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/service-history?${qs}` : '/service-history';
}

function CostBarChartCard({
  title,
  data,
  barColor,
  category,
  href,
}: {
  title: string;
  data: DashboardCostChartPoint[];
  barColor: string;
  category?: 'other' | 'all';
  href: string;
}) {
  const router = useRouter();
  const hasData = data.some((row) => row.value > 0);

  const handleBarClick = (row: DashboardCostChartPoint, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const range = monthRangeFromKey(row.label);
    router.push(
      serviceHistoryHref({
        from: range?.from,
        to: range?.to,
        category: category === 'other' ? 'other' : undefined,
      }),
    );
  };

  return (
    <Card
      className="h-full cursor-pointer rounded-lg border-slate-200 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      onClick={() => router.push(href)}
    >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
          <MoreHorizontal className="h-4 w-4 text-slate-400" aria-hidden />
        </CardHeader>
        <CardContent className="h-72 px-2 pb-4 pt-0">
          {!hasData ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-500">—</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  width={40}
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(Number(value))}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as DashboardCostChartPoint | undefined;
                    return row?.label ?? '';
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar
                  dataKey="value"
                  fill={barColor}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  className="cursor-pointer"
                  onClick={(bar, _index, event) => {
                    const payload = (bar as { payload?: DashboardCostChartPoint }).payload;
                    if (payload) handleBarClick(payload, event);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
  );
}

function TopRepairReasonsCard({
  reasons,
}: {
  reasons: DashboardCostAnalytics['topRepairReasons'];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pieData = reasons.map((reason) => ({
    ...reason,
    name: reason.label,
  }));
  const hasData = pieData.some((row) => row.count > 0);

  return (
    <Card className="h-full rounded-lg border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-slate-900">
          {t('dashboard.costCharts.topRepairReasons')}
        </CardTitle>
        <Link href="/service-history" className="text-slate-400 hover:text-slate-600">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {!hasData ? (
          <p className="flex h-72 items-center justify-center text-sm text-slate-500">—</p>
        ) : (
          <div className="grid h-72 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={72}
                    paddingAngle={1}
                    stroke="#fff"
                    strokeWidth={2}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const label = (entry as { label?: string }).label;
                      if (label) {
                        router.push(serviceHistoryHref({ service_type: label }));
                      }
                    }}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _name, item) => {
                      const row = item?.payload as { label?: string; total?: number } | undefined;
                      return [
                        `${value} · ${formatCurrency(Number(row?.total ?? 0))}`,
                        row?.label ?? '',
                      ];
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col justify-center divide-y divide-slate-100">
              {reasons.map((reason) => (
                <li key={reason.id}>
                  <Link
                    href={serviceHistoryHref({ service_type: reason.label })}
                    className="group flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: reason.color }}
                        aria-hidden
                      />
                      <span className="truncate">{reason.label}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        reason.color === '#ef4444' && 'bg-red-50 text-red-700',
                        reason.color === '#f97316' && 'bg-orange-50 text-orange-700',
                        reason.color === '#a855f7' && 'bg-violet-50 text-violet-700',
                        reason.color === '#94a3b8' && 'bg-slate-100 text-slate-700',
                        reason.color === '#06b6d4' && 'bg-cyan-50 text-cyan-700',
                      )}
                    >
                      {reason.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FleetCostChartsClient({ analytics }: { analytics: DashboardCostAnalytics }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.costCharts.title')}</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CostBarChartCard
          title={t('dashboard.costCharts.otherCosts')}
          data={analytics.otherCosts}
          barColor="#eab308"
          category="other"
          href={serviceHistoryHref({ category: 'other' })}
        />
        <TopRepairReasonsCard reasons={analytics.topRepairReasons} />
        <CostBarChartCard
          title={t('dashboard.costCharts.totalCosts')}
          data={analytics.totalCosts}
          barColor="#2563eb"
          href="/service-history"
        />
      </div>
    </section>
  );
}
