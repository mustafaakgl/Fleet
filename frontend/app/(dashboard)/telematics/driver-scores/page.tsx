'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, telematicsApi } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import type { TelematicsDriverScoreItem } from '@/lib/types';

const EMPTY_DRIVER_SCORES: TelematicsDriverScoreItem[] = [];

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (score >= 65) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

function scoreBandLabel(score: number, t: (key: string) => string): string {
  if (score >= 80) return t('telematics.driverScores.band.high');
  if (score >= 65) return t('telematics.driverScores.band.medium');
  return t('telematics.driverScores.band.low');
}

export default function DriverScoresPage() {
  const { t } = useTranslation();
  const scoresQuery = useQuery({
    queryKey: ['telematics', 'driver-scores'],
    queryFn: () => telematicsApi.getDriverScores(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = scoresQuery.data?.drivers ?? EMPTY_DRIVER_SCORES;
  const fleetAverage = scoresQuery.data?.fleetAverage ?? 0;
  const error = scoresQuery.error
    ? getApiErrorMessage(scoresQuery.error, t('telematics.driverScores.loadError'))
    : null;

  const chartData = useMemo(() => {
    if (items.length === 0) return [];

    const high = items.filter((item) => item.score >= 80).length;
    const medium = items.filter((item) => item.score >= 65 && item.score < 80).length;
    const low = items.filter((item) => item.score < 65).length;

    return [
      { key: t('telematics.driverScores.band.high'), value: high },
      { key: t('telematics.driverScores.band.medium'), value: medium },
      { key: t('telematics.driverScores.band.low'), value: low },
    ];
  }, [items, t]);

  const highRiskCount = useMemo(() => items.filter((item) => item.score < 65).length, [items]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <Gauge className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{t('nav.telematics.driverScores')}</h1>
          <p className="text-sm text-slate-600">{t('telematics.driverScores.subtitle')}</p>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error')}
          subtitle={error}
          actionLabel={t('common.retry')}
          onAction={() => void scoresQuery.refetch()}
        />
      ) : null}

      {!error && scoresQuery.isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}

      {!error && !scoresQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.driverScores.cards.average')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-blue-700">{fleetAverage.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.driverScores.cards.drivers')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{items.length}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">{t('telematics.driverScores.cards.highRisk')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-red-700">{highRiskCount}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!error && !scoresQuery.isLoading && items.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title={t('telematics.driverScores.emptyTitle')}
          subtitle={t('telematics.driverScores.emptySubtitle')}
        />
      ) : null}

      {!error && !scoresQuery.isLoading && items.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('telematics.driverScores.distributionTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={32} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className={FLEET_LIST_CARD}>
            <CardHeader>
              <CardTitle>{t('telematics.driverScores.table.title')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={FLEET_TABLE}>
                <TableHeader>
                  <TableRow className={FLEET_TABLE_HEADER_ROW}>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.rank')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.driver')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.score')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.band')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.harsh')}</TableHead>
                    <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.overspeed')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={FLEET_TABLE_BODY}>
                  {items.map((item, index) => (
                    <TableRow key={item.driverId} className={FLEET_TABLE_ROW}>
                      <TableCell className={FLEET_TABLE_CELL}>{index + 1}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_PRIMARY}>{item.name}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={`border text-xs ${scoreBadgeClass(item.score)}`}>
                          {item.score.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        {scoreBandLabel(item.score, (key) => t(key))}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.harshCount}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{item.overspeedCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
