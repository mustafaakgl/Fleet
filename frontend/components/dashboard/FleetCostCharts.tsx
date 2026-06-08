'use client';

import dynamic from 'next/dynamic';
import type { DashboardCostAnalytics } from '@/lib/types';

const FleetCostChartsClient = dynamic(
  () => import('./FleetCostChartsClient').then((mod) => mod.FleetCostChartsClient),
  {
    ssr: false,
    loading: () => (
      <section className="space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </section>
    ),
  },
);

export function FleetCostCharts({ analytics }: { analytics: DashboardCostAnalytics }) {
  return <FleetCostChartsClient analytics={analytics} />;
}
