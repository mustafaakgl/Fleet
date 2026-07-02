'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp, Gauge, Medal, Minus, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FleetTripRouteMap } from '@/components/fleet-analytics/FleetTripRouteMap';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getApiErrorMessage, telematicsApi } from '@/lib/api';
import {
  driverScoreTextClass,
  per100KmIntensityClass,
} from '@/lib/driver-score-intensity';
import { estimateIdleFuelCostEur, TELEMATICS_THRESHOLDS } from '@/lib/telematics-thresholds';
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
import { formatFleetDateTime } from '@/lib/locale-format';
import { formatTachographDurationS } from '@/lib/tachograph-format';
import type { TelematicsDriverScoreItem, TelematicsDriverTripItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function Sparkline({ values }: { values: Array<number | null> }) {
  const numeric = values.filter((value): value is number => value !== null);
  const max = Math.max(...numeric, 1);
  return (
    <div className="hidden h-6 items-end gap-px xl:flex" aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className="w-1 rounded-sm bg-slate-300"
          style={{ height: `${Math.max(8, ((value ?? 0) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function rankMedal(rank: number) {
  if (rank === 1) return <Medal className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return null;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return <Minus className="h-3.5 w-3.5 text-slate-400" aria-hidden />;
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center text-xs text-emerald-700">
        <ArrowUp className="h-3 w-3" />
        {delta.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs text-red-700">
      <ArrowDown className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function DriverTripDetail({
  driverId,
  selectedTripId,
  onSelectTrip,
}: {
  driverId: string;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
}) {
  const { t } = useTranslation();
  const tripsQuery = useQuery({
    queryKey: ['telematics', 'driver-trips', driverId],
    queryFn: () => telematicsApi.getDriverTrips(driverId),
    enabled: Boolean(driverId),
  });

  const trips = tripsQuery.data?.items ?? [];
  const selectedTrip: TelematicsDriverTripItem | null =
    trips.find((trip) => trip.id === selectedTripId) ?? trips[0] ?? null;

  if (tripsQuery.isLoading) {
    return <p className="py-4 text-sm text-slate-500">{t('common.loading')}</p>;
  }

  if (trips.length === 0) {
    return <p className="py-4 text-sm text-slate-500">{t('telematics.driverScores.noTrips')}</p>;
  }

  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table className={FLEET_TABLE}>
          <TableHeader>
            <TableRow className={FLEET_TABLE_HEADER_ROW}>
              <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.trips.date')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.trips.km')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.trips.duration')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.trips.events')}</TableHead>
              <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.trips.score')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={FLEET_TABLE_BODY}>
            {trips.map((trip) => {
              const eventTotal =
                trip.eventCounts.speeding
                + trip.eventCounts.harsh_brake
                + trip.eventCounts.harsh_accel;
              const active = (selectedTrip?.id ?? '') === trip.id;
              return (
                <TableRow
                  key={trip.id}
                  className={cn(FLEET_TABLE_ROW, 'cursor-pointer', active && 'bg-blue-50')}
                  onClick={() => onSelectTrip(trip.id)}
                >
                  <TableCell className={FLEET_TABLE_CELL}>{formatFleetDateTime(trip.startedAt)}</TableCell>
                  <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>{trip.distanceKm.toFixed(1)}</TableCell>
                  <TableCell className={FLEET_TABLE_CELL}>
                    {formatTachographDurationS(trip.durationS, t)}
                  </TableCell>
                  <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>{eventTotal}</TableCell>
                  <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                    {trip.score !== null ? trip.score.toFixed(1) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {selectedTrip ? (
        <FleetTripRouteMap
          locationPoints={selectedTrip.locationPoints}
          drivingEvents={selectedTrip.drivingEvents}
        />
      ) : null}
    </div>
  );
}

export default function DriverScoresPage() {
  const { t } = useTranslation();
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [selectedTripByDriver, setSelectedTripByDriver] = useState<Record<string, string>>({});

  const scoresQuery = useQuery({
    queryKey: ['telematics', 'driver-scores'],
    queryFn: () => telematicsApi.getDriverScores(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = scoresQuery.data?.items ?? [];
  const fleetTrend = scoresQuery.data?.fleetTrend ?? [];
  const targetScore = scoresQuery.data?.targetScore ?? 80;
  const error = scoresQuery.error
    ? getApiErrorMessage(scoresQuery.error, t('telematics.driverScores.loadError'))
    : null;

  const trendChartData = useMemo(
    () =>
      fleetTrend.map((point) => ({
        week: formatFleetDateTime(point.weekStart).slice(0, 10),
        score: point.averageScore,
      })),
    [fleetTrend],
  );

  const idleFuelCostEur = useMemo(() => {
    const totalIdleMinPerDay = items.reduce((sum, item) => sum + item.idleMinPerDay, 0);
    return estimateIdleFuelCostEur(totalIdleMinPerDay, scoresQuery.data?.periodDays ?? 28);
  }, [items, scoresQuery.data?.periodDays]);

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className={FLEET_LIST_CARD} data-testid="idle-fuel-cost-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t('telematics.driverScores.idleFuelCostTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className="tabular-nums text-[22px] font-semibold text-slate-900"
                title={t('telematics.driverScores.idleFuelCostTooltip', {
                  litersPerHour: TELEMATICS_THRESHOLDS.idleFuelLitersPerHourBlend.toFixed(1),
                  price: TELEMATICS_THRESHOLDS.defaultFuelEurPerLiter.toFixed(2),
                })}
              >
                ~{EUR.format(idleFuelCostEur)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{t('telematics.driverScores.idleFuelCostHint')}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!error && !scoresQuery.isLoading ? (
        <Card className={FLEET_LIST_CARD}>
          <CardHeader>
            <CardTitle>{t('telematics.driverScores.fleetTrendTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                <Tooltip />
                <ReferenceLine y={targetScore} stroke="#94a3b8" strokeDasharray="4 4" label={t('telematics.driverScores.target', { score: targetScore })} />
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {!error && !scoresQuery.isLoading && items.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title={t('telematics.driverScores.emptyTitle')}
          subtitle={t('telematics.driverScores.emptySubtitle')}
        />
      ) : null}

      {!error && !scoresQuery.isLoading && items.length > 0 ? (
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
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'hidden xl:table-cell')}>{t('telematics.driverScores.table.trend')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.overspeed')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.harshBrake')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.harshAccel')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.idle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('telematics.driverScores.table.km')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {items.map((item: TelematicsDriverScoreItem, index) => {
                  const rank = index + 1;
                  const expanded = expandedDriverId === item.driverId;
                  return (
                    <Fragment key={item.driverId}>
                      <TableRow
                        className={cn(FLEET_TABLE_ROW, 'cursor-pointer')}
                        onClick={() => setExpandedDriverId(expanded ? null : item.driverId)}
                      >
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>
                          <span className="inline-flex items-center gap-1">
                            {rankMedal(rank)}
                            {rank}
                          </span>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                              {item.initials}
                            </span>
                            <span>{item.driverName}</span>
                          </div>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {item.insufficientData ? (
                            <span className="text-sm text-slate-500">{t('telematics.driverScores.insufficientData')}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={cn('tabular-nums text-[22px] font-semibold leading-none', driverScoreTextClass(item.score, false))}>
                                {item.score?.toFixed(0)}
                              </span>
                              <DeltaBadge delta={item.weeklyDelta} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'hidden xl:table-cell')}>
                          <Sparkline values={item.weeklyScores} />
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums', per100KmIntensityClass(item.speedingPer100Km))}>
                          {item.insufficientData ? '—' : item.speedingPer100Km.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums', per100KmIntensityClass(item.harshBrakePer100Km))}>
                          {item.insufficientData ? '—' : item.harshBrakePer100Km.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums', per100KmIntensityClass(item.harshAccelPer100Km))}>
                          {item.insufficientData ? '—' : item.harshAccelPer100Km.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums', item.idleMinPerDay > 30 && 'text-amber-700')}>
                          {item.idleMinPerDay.toFixed(1)}
                        </TableCell>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'tabular-nums')}>{Math.round(item.distanceKm)}</TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={9} className="p-0">
                            <DriverTripDetail
                              driverId={item.driverId}
                              selectedTripId={selectedTripByDriver[item.driverId] ?? null}
                              onSelectTrip={(tripId) =>
                                setSelectedTripByDriver((current) => ({ ...current, [item.driverId]: tripId }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
