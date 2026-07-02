'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EvidenceLine } from '@/components/tachograph/EvidenceLine';
import { tachographApi } from '@/lib/api';
import { formatFleetDateTime } from '@/lib/locale-format';
import { infringementTypeLabelKey } from '@/lib/tachograph-infringement-meta';

type ScatterPoint = {
  week: string;
  score: number;
  severity: 'medium' | 'critical';
  type: string;
  occurredAt: string;
};

function InfringementDot(props: {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const fill = payload.severity === 'critical' ? '#dc2626' : '#d97706';
  return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#fff" strokeWidth={1} />;
}

export function DriverStoryCard({ driverId }: { driverId: string }) {
  const { t } = useTranslation();
  const storyQuery = useQuery({
    queryKey: ['tachograph', 'driver-story', driverId],
    queryFn: () => tachographApi.getDriverStory(driverId, { weeks: 12 }),
    staleTime: 60_000,
  });

  const chartData = useMemo(() => {
    const weeks = storyQuery.data?.weeks ?? [];
    return weeks.map((week) => ({
      week: formatFleetDateTime(week.weekStart).slice(0, 10),
      km: week.distanceKm,
      score: week.score,
    }));
  }, [storyQuery.data?.weeks]);

  const scatterData = useMemo(() => {
    const weeks = storyQuery.data?.weeks ?? [];
    const points: ScatterPoint[] = [];
    weeks.forEach((week) => {
      const weekLabel = formatFleetDateTime(week.weekStart).slice(0, 10);
      week.infringementEvents.forEach((event) => {
        points.push({
          week: weekLabel,
          score: week.score ?? 72,
          severity: event.severity,
          type: event.type,
          occurredAt: event.occurredAt,
        });
      });
    });
    return points;
  }, [storyQuery.data?.weeks]);

  const weeksWithData = storyQuery.data?.weeksWithData ?? 0;
  const openCount = storyQuery.data?.openInfringementCount ?? 0;

  return (
    <Card data-testid="driver-story-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t('driverDetail.storyTitle')}</CardTitle>
        {openCount > 0 ? (
          <Link href={`/tachograph/infringements?driverId=${driverId}&status=open`}>
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
              {t('driverDetail.storyOpenInfringements', { count: openCount })}
            </Badge>
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {storyQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : storyQuery.isError ? (
          <p className="text-sm text-slate-500">{t('driverDetail.storyLoadError')}</p>
        ) : weeksWithData < 4 ? (
          <p className="text-sm text-slate-500" data-testid="driver-story-empty">
            {t('driverDetail.storyInsufficientHistory')}
          </p>
        ) : (
          <div className="h-72" data-testid="driver-story-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis
                  yAxisId="km"
                  orientation="left"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  width={40}
                  label={{ value: 'km', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                />
                <YAxis
                  yAxisId="score"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  width={36}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'km') return [`${value} km`, t('driverDetail.storyKm')];
                    if (name === 'score') return [value, t('driverDetail.storyScore')];
                    return [value, name];
                  }}
                />
                <ReferenceLine yAxisId="score" y={80} stroke="#94a3b8" strokeDasharray="4 4" />
                <Bar yAxisId="km" dataKey="km" fill="#cbd5e1" radius={[2, 2, 0, 0]} />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="score"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Scatter
                  yAxisId="score"
                  data={scatterData}
                  dataKey="score"
                  name={t('driverDetail.storyInfringements')}
                  shape={<InfringementDot />}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {(storyQuery.data?.recentInfringements ?? []).length > 0 ? (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('driverDetail.storyRecentEvidence')}
            </p>
            {storyQuery.data!.recentInfringements.map((row) => (
              <div key={row.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
                <p className="text-xs text-slate-500">
                  {formatFleetDateTime(row.occurredAt)} ·{' '}
                  {t(infringementTypeLabelKey(row.type), row.type)}
                </p>
                <EvidenceLine type={row.type} evidence={row.evidence} />
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
