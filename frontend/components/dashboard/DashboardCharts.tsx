'use client';

import dynamic from 'next/dynamic';
import type { DashboardChartAnalytics } from '@/lib/types';

const DashboardChartsClient = dynamic(
  () => import('./DashboardChartsClient').then((mod) => mod.DashboardChartsClient),
  {
    ssr: false,
    loading: () => (
      <section className="space-y-3">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </section>
    ),
  },
);

export function DashboardCharts({ analytics }: { analytics: DashboardChartAnalytics }) {
  return <DashboardChartsClient analytics={analytics} />;
}
