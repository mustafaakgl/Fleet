'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Download, Route, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { driversApi, fleetTripsApi, getApiErrorMessage, vehiclesApi } from '@/lib/api';
import { FLEET_FUEL_PERIOD_WEEKS, fleetFuelDateRange } from '@/lib/fleet-fuel-report';
import {
  formatFleetTripDistance,
  formatFleetTripDurationSeconds,
  formatFleetTripScore,
  formatFleetTripSpeed,
} from '@/lib/fleet-trip-format';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
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
  FLEET_TABLE_ROW_CLICKABLE,
  FLEET_TOOLBAR,
} from '@/lib/fleet-table';
import { formatFleetDateTime } from '@/lib/locale-format';
import type { Driver, FleetTripSummary, Vehicle } from '@/lib/types';

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadTripsCsv(
  rows: FleetTripSummary[],
  vehicleLabels: Map<string, string>,
  driverLabels: Map<string, string>,
) {
  const headers = [
    'started_at',
    'vehicle',
    'driver',
    'distance_km',
    'duration_seconds',
    'avg_speed_kmh',
    'score',
    'status',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.startedAt,
        vehicleLabels.get(row.vehicleId) ?? row.vehicleId,
        driverLabels.get(row.driverId) ?? row.driverId,
        row.distanceKm ?? '',
        row.durationS ?? '',
        row.avgSpeedKmh ?? '',
        row.score ?? '',
        row.status,
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(','),
    );
  }

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fleet-trips-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function FleetTripsPage() {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(8);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [trips, setTrips] = useState<FleetTripSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void vehiclesApi
      .list({ limit: 200, status: 'active' })
      .then((page) => setVehicles(page.data))
      .catch(() => setVehicles([]));
    void driversApi
      .list({ limit: 200, status: 'active' })
      .then((page) => setDrivers(page.data))
      .catch(() => setDrivers([]));
  }, []);

  const vehicleLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const vehicle of vehicles) {
      map.set(vehicle.id, vehicle.plate_number);
    }
    return map;
  }, [vehicles]);

  const driverLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      map.set(driver.id, `${driver.first_name} ${driver.last_name}`.trim());
    }
    return map;
  }, [drivers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = fleetFuelDateRange(weeks);
      const result = await fleetTripsApi.list({
        ...range,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
      });
      setTrips(result);
    } catch (e) {
      setTrips([]);
      setError(getApiErrorMessage(e, t('fleetTrips.loadError', 'Sefer geçmişi yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [driverId, t, vehicleId, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const closedTrips = trips.filter((trip) => trip.status === 'closed');
    const totalDistance = closedTrips.reduce(
      (sum, trip) => sum + (Number(trip.distanceKm) || 0),
      0,
    );
    const scoredTrips = closedTrips.filter((trip) => trip.score != null);
    const avgScore =
      scoredTrips.length > 0
        ? scoredTrips.reduce((sum, trip) => sum + (Number(trip.score) || 0), 0) / scoredTrips.length
        : null;

    return {
      total: trips.length,
      active: trips.filter((trip) => trip.status === 'active').length,
      totalDistance,
      avgScore,
    };
  }, [trips]);

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Route className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fleetTrips.title', 'Sefer geçmişi')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={weeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
          >
            {FLEET_FUEL_PERIOD_WEEKS.map((option) => (
              <option key={option} value={option}>
                {t('fleetFuelReport.periodWeeks', '{{count}} hafta', { count: option })}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => downloadTripsCsv(trips, vehicleLabels, driverLabels)}
            disabled={trips.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv', 'CSV exportieren')}
          </Button>
        </div>
      </div>

      <div className={`${FLEET_TOOLBAR} mb-2`}>
        <Select
          className={FLEET_FILTER_SELECT}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="">{t('fleetTrips.filterAllVehicles', 'Tüm araçlar')}</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate_number}
            </option>
          ))}
        </Select>
        <Select
          className={FLEET_FILTER_SELECT}
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
        >
          <option value="">{t('fleetTrips.filterAllDrivers', 'Tüm sürücüler')}</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driverLabels.get(driver.id)}
            </option>
          ))}
        </Select>
        <Input className={`${FLEET_FILTER_INPUT} max-w-xs`} readOnly value={fleetFuelDateRange(weeks).from} />
        <span className="text-sm text-muted-foreground">–</span>
        <Input className={`${FLEET_FILTER_INPUT} max-w-xs`} readOnly value={fleetFuelDateRange(weeks).to} />
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

      {!error && !loading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.totalTrips', 'Toplam sefer')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary.total}</p>
              </CardContent>
            </Card>
            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.activeTrips', 'Aktif sefer')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary.active}</p>
              </CardContent>
            </Card>
            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.totalDistance', 'Toplam km')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary.totalDistance.toFixed(0)} km</p>
              </CardContent>
            </Card>
            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.avgScore', 'Ort. skor')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {summary.avgScore != null ? Math.round(summary.avgScore) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader>
              <CardTitle>{t('fleetTrips.tableTitle', 'Seferler')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {trips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('fleetTrips.noData', 'Seçilen dönemde sefer yok.')}
                </p>
              ) : (
                <Table className={FLEET_TABLE}>
                  <TableHeader>
                    <TableRow className={FLEET_TABLE_HEADER_ROW}>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colStarted', 'Başlangıç')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colVehicle', 'Araç')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colDriver', 'Sürücü')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colDistance', 'Mesafe')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colDuration', 'Süre')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colAvgSpeed', 'Ort. hız')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colScore', 'Skor')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD}>
                        {t('fleetTrips.colStatus', 'Durum')}
                      </TableHead>
                      <TableHead className={FLEET_TABLE_HEAD} aria-hidden />
                    </TableRow>
                  </TableHeader>
                  <TableBody className={FLEET_TABLE_BODY}>
                    {trips.map((trip) => (
                      <TableRow key={trip.id} className={FLEET_TABLE_ROW_CLICKABLE}>
                        <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                          <Link
                            href={`/fleet-analytics/trips/${trip.id}`}
                            className="inline-flex items-center gap-1 hover:text-primary"
                          >
                            {formatFleetDateTime(trip.startedAt)}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {vehicleLabels.get(trip.vehicleId) ?? trip.vehicleId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {driverLabels.get(trip.driverId) ?? trip.driverId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {formatFleetTripDistance(trip.distanceKm)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {formatFleetTripDurationSeconds(trip.durationS, t)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {formatFleetTripSpeed(trip.avgSpeedKmh)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          {formatFleetTripScore(trip.score)}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Badge variant={trip.status === 'active' ? 'default' : 'secondary'}>
                            {trip.status === 'active'
                              ? t('fleetTrips.statusActive', 'Aktif')
                              : t('fleetTrips.statusClosed', 'Kapalı')}
                          </Badge>
                          {trip.hasDataGap ? (
                            <span className="ml-2 text-xs text-amber-600">
                              {t('fleetTrips.dataGap', 'GPS boşluk')}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>
                          <Link
                            href={`/fleet-analytics/trips/${trip.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {t('fleetTrips.openDetail', 'Harita')}
                          </Link>
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
