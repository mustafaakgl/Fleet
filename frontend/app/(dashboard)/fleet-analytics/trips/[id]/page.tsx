'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Route, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi, fleetTripsApi, getApiErrorMessage, vehiclesApi } from '@/lib/api';
import {
  formatFleetTripDistance,
  formatFleetTripDurationSeconds,
  formatFleetTripScore,
  formatFleetTripSpeed,
} from '@/lib/fleet-trip-format';
import {
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { formatFleetDateTime } from '@/lib/locale-format';
import type { FleetTripDetail } from '@/lib/types';

const FleetTripRouteMap = dynamic(
  () =>
    import('@/components/fleet-analytics/FleetTripRouteMap').then((module) => module.FleetTripRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading map...
      </div>
    ),
  },
);

export default function FleetTripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const [trip, setTrip] = useState<FleetTripDetail | null>(null);
  const [plateNumber, setPlateNumber] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fleetTripsApi.getById(id);
      setTrip(result);

      const [vehicle, driverPage] = await Promise.all([
        vehiclesApi.getById(result.vehicleId).catch(() => null),
        driversApi.getById(result.driverId).catch(() => null),
      ]);

      setPlateNumber(vehicle?.plate_number ?? null);
      setDriverName(
        driverPage ? `${driverPage.first_name} ${driverPage.last_name}`.trim() : null,
      );
    } catch (e) {
      setTrip(null);
      setError(getApiErrorMessage(e, t('fleetTrips.loadError', 'Sefer geçmişi yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryCards = useMemo(() => {
    if (!trip) return [];
    return [
      {
        key: 'distance',
        label: t('fleetTrips.colDistance', 'Mesafe'),
        value: formatFleetTripDistance(trip.distanceKm),
      },
      {
        key: 'duration',
        label: t('fleetTrips.colDuration', 'Süre'),
        value: formatFleetTripDurationSeconds(trip.durationS, t),
      },
      {
        key: 'avgSpeed',
        label: t('fleetTrips.colAvgSpeed', 'Ort. hız'),
        value: formatFleetTripSpeed(trip.avgSpeedKmh),
      },
      {
        key: 'maxSpeed',
        label: t('fleetTrips.detail.maxSpeed', 'Maks. hız'),
        value: formatFleetTripSpeed(trip.maxSpeedKmh),
      },
      {
        key: 'score',
        label: t('fleetTrips.colScore', 'Skor'),
        value: formatFleetTripScore(trip.score),
      },
      {
        key: 'events',
        label: t('fleetTrips.detail.eventCount', 'Olay sayısı'),
        value: String(trip.drivingEvents.length),
      },
    ];
  }, [t, trip]);

  const title = plateNumber
    ? t('fleetTrips.detail.titlePlate', 'Sefer — {{plate}}', { plate: plateNumber })
    : t('fleetTrips.detail.title', 'Sefer detayı');

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <Link
          href="/fleet-analytics/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('fleetTrips.backToList', 'Sefer listesi')}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Route className="h-6 w-6 text-primary" />
        <div>
          <h1 className={FLEET_PAGE_TITLE}>{title}</h1>
          <p className="text-sm text-muted-foreground">
            {driverName ?? '—'} · {formatFleetDateTime(trip?.startedAt)}
            {trip?.endedAt ? ` – ${formatFleetDateTime(trip.endedAt)}` : ''}
          </p>
        </div>
        {trip ? (
          <Badge variant={trip.status === 'active' ? 'default' : 'secondary'}>
            {trip.status === 'active'
              ? t('fleetTrips.statusActive', 'Aktif')
              : t('fleetTrips.statusClosed', 'Kapalı')}
          </Badge>
        ) : null}
        {trip?.hasDataGap ? (
          <Badge variant="outline">{t('fleetTrips.dataGap', 'GPS boşluk')}</Badge>
        ) : null}
      </div>

      {error ? (
        <EmptyState
          icon={WifiOff}
          title={t('common.error', 'Fehler')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Laden…')}</p>
      ) : null}

      {!error && !loading && trip ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <Card key={card.key} className={FLEET_LIST_CARD}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetTrips.detail.routeMap', 'GPS rotası')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FleetTripRouteMap
                locationPoints={trip.locationPoints}
                drivingEvents={trip.drivingEvents}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {t('fleetTrips.detail.routePoints', '{{count}} GPS noktası', {
                  count: trip.locationPoints.length,
                })}
              </p>
            </CardContent>
          </Card>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetTrips.detail.events', 'Sürüş olayları')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {trip.drivingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetTrips.detail.noEvents', 'Bu seferde olay kaydı yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.detail.eventTime', 'Zaman')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.detail.eventType', 'Olay')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.detail.eventValue', 'Değer')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.detail.eventThreshold', 'Eşik')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {trip.drivingEvents.map((event) => (
                      <TableRow key={event.id} className={FLEET_TABLE_ROW}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          {formatFleetDateTime(event.occurredAt)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {event.type === 'speeding'
                            ? t('fleetTrips.eventSpeeding', 'Hız ihlali')
                            : event.type === 'harsh_accel'
                              ? t('fleetTrips.eventHarshAccel', 'Sert hızlanma')
                              : t('fleetTrips.eventHarshBrake', 'Sert fren')}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {formatFleetTripSpeed(event.value)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          {formatFleetTripSpeed(event.threshold)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
