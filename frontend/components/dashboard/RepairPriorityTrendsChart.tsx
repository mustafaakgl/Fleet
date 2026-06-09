'use client';

import dynamic from 'next/dynamic';
import type { DashboardPriorityTrendPoint } from '@/lib/types';

const RepairPriorityTrendsChartClient = dynamic(
  () =>
    import('./RepairPriorityTrendsChartClient').then((mod) => mod.RepairPriorityTrendsChartClient),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    ),
  },
);

export function RepairPriorityTrendsChart({
  trends,
}: {
  trends: DashboardPriorityTrendPoint[];
}) {
  return <RepairPriorityTrendsChartClient trends={trends} />;
}
