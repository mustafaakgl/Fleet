'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardPriorityTrendPoint } from '@/lib/types';
import { monthRangeFromKey } from '@/lib/service-record-categories';
import { cn } from '@/lib/utils';

type PrioritySeriesKey = 'scheduled' | 'nonScheduled' | 'emergency' | 'none';

const SERIES: Array<{ key: PrioritySeriesKey; color: string; labelKey: string; fallback: string }> = [
  { key: 'scheduled', color: '#22c55e', labelKey: 'dashboard.priorityTrends.scheduled', fallback: 'Scheduled' },
  { key: 'nonScheduled', color: '#f59e0b', labelKey: 'dashboard.priorityTrends.nonScheduled', fallback: 'Non-Scheduled' },
  { key: 'emergency', color: '#ef4444', labelKey: 'dashboard.priorityTrends.emergency', fallback: 'Emergency' },
  { key: 'none', color: '#cbd5e1', labelKey: 'dashboard.priorityTrends.none', fallback: 'None' },
];

function serviceHistoryHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/service-history?${qs}` : '/service-history';
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return '0%';
}

type ClickableDotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: DashboardPriorityTrendPoint;
  color: string;
  selected: boolean;
  onSelect: (index: number) => void;
};

function ClickableDot({ color, selected, onSelect, cx, cy, index, payload }: ClickableDotProps) {
  if (cx == null || cy == null || index == null) return null;
  if (!payload || payload.total <= 0) return null;

  return (
    <g style={{ cursor: 'pointer' }}>
      <circle
        cx={cx}
        cy={cy}
        r={10}
        fill="transparent"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(index);
        }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={selected ? 5 : 3}
        fill="#fff"
        stroke={color}
        strokeWidth={2}
        pointerEvents="none"
      />
    </g>
  );
}

export function RepairPriorityTrendsChartClient({
  trends,
}: {
  trends: DashboardPriorityTrendPoint[];
}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const hasData = trends.some((row) => row.total > 0);

  const labels = useMemo(
    () =>
      Object.fromEntries(
        SERIES.map((series) => [
          series.key,
          t(series.labelKey, { defaultValue: series.fallback }),
        ]),
      ) as Record<PrioritySeriesKey, string>,
    [t],
  );

  function openMonth(row: DashboardPriorityTrendPoint) {
    const range = monthRangeFromKey(row.label);
    router.push(
      serviceHistoryHref({
        from: range?.from,
        to: range?.to,
      }),
    );
  }

  return (
    <Card className="h-full rounded-lg border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-slate-900">
          {t('dashboard.priorityTrends.title', { defaultValue: 'Repair Priority Class Trends' })}
        </CardTitle>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-600"
          onClick={() => router.push('/service-history')}
          aria-label={t('serviceHistory.title', { defaultValue: 'Service History' })}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="px-2 pb-4 pt-0">
        {!hasData ? (
          <p className="flex h-72 items-center justify-center text-sm text-slate-500">—</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trends}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    width={36}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      labels[name as PrioritySeriesKey] ?? name,
                    ]}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as DashboardPriorityTrendPoint | undefined;
                      return row?.shortLabel ?? '';
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  {SERIES.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={labels[series.key]}
                      stackId="priority"
                      stroke={series.color}
                      fill={series.color}
                      fillOpacity={0.72}
                      strokeWidth={2}
                      dot={(props) => {
                        const dotProps = props as ClickableDotProps;
                        return (
                          <ClickableDot
                            cx={dotProps.cx}
                            cy={dotProps.cy}
                            index={dotProps.index}
                            payload={dotProps.payload}
                            color={series.color}
                            selected={selectedIndex === dotProps.index}
                            onSelect={setSelectedIndex}
                          />
                        );
                      }}
                      activeDot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-2 text-xs text-slate-600">
              {SERIES.map((series) => (
                <span key={series.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: series.color }}
                    aria-hidden
                  />
                  {labels[series.key]}
                </span>
              ))}
            </div>

            {selectedIndex !== null && trends[selectedIndex] ? (
              <div className="mx-2 mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {trends[selectedIndex].shortLabel}
                    {selectedIndex > 0 ? (
                      <span className="font-normal text-slate-500">
                        {' '}
                        {t('dashboard.priorityTrends.vsPrevious', {
                          defaultValue: 'vs',
                        })}{' '}
                        {trends[selectedIndex - 1].shortLabel}
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-700 hover:underline"
                    onClick={() => openMonth(trends[selectedIndex])}
                  >
                    {t('dashboard.priorityTrends.viewMonth', { defaultValue: 'View entries' })}
                  </button>
                </div>
                {selectedIndex === 0 ? (
                  <p className="text-xs text-slate-500">
                    {t('dashboard.priorityTrends.noPreviousMonth', {
                      defaultValue: 'No previous month to compare.',
                    })}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {SERIES.map((series) => {
                      const current = trends[selectedIndex][series.key];
                      const previous = trends[selectedIndex - 1][series.key];
                      const delta = Math.round((current - previous) * 10) / 10;
                      return (
                        <span key={series.key} className="text-xs">
                          <span className="text-slate-600">{labels[series.key]}: </span>
                          <span
                            className={cn(
                              'font-semibold',
                              delta > 0 && 'text-emerald-600',
                              delta < 0 && 'text-red-600',
                              delta === 0 && 'text-slate-500',
                            )}
                          >
                            {formatDelta(delta)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 px-2 text-center text-[11px] text-slate-400">
                {t('dashboard.priorityTrends.clickHint', {
                  defaultValue: 'Click a monthly point to compare with the previous month.',
                })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
