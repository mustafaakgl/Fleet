'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, MapPinned, Route, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  driversApi,
  fleetTripsApi,
  getApiErrorMessage,
  vehiclesApi,
} from '@/lib/api';
import { formatFleetTripDistance, formatFleetTripDurationSeconds, formatFleetTripScore, formatFleetTripSpeed } from '@/lib/fleet-trip-format';
import {
  FLEET_FILTER_INPUT,
  FLEET_FILTER_SELECT,
  FLEET_LIST_CARD,
  FLEET_PAGE,
  FLEET_PAGE_HEADER,
  FLEET_PAGE_TITLE,
} from '@/lib/fleet-table';
import { formatFleetDate } from '@/lib/locale-format';
import type {
  Driver,
  FleetTripDetail,
  FleetTripStopEntry,
  FleetTripSummary,
  FleetTripTimelineDay,
  FleetTripTimelineResponse,
  FleetTripTimelineTrip,
  TripPurpose,
  Vehicle,
} from '@/lib/types';

const FleetTripRouteMap = dynamic(
  () => import('@/components/fleet-analytics/FleetTripRouteMap').then((module) => module.FleetTripRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading map...
      </div>
    ),
  },
);

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

function monthRange(month: string): { from: string; to: string } {
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatTimeRange(startedAt: string, endedAt: string | null): string {
  return endedAt ? `${formatTime(startedAt)}–${formatTime(endedAt)}` : formatTime(startedAt);
}

function formatOdometerRange(startKm: number | null | undefined, endKm: number | null | undefined): string {
  if (startKm == null && endKm == null) return '—';
  if (startKm == null || endKm == null) return '—';
  return `${startKm.toFixed(3)}–${endKm.toFixed(3)} km`;
}

const TRIP_PURPOSE_OPTIONS: Array<{ value: TripPurpose; label: string }> = [
  { value: 'business', label: 'İş' },
  { value: 'private', label: 'Özel' },
  { value: 'commute', label: 'İşe gidiş' },
];

function formatTripPurposeLabel(value: TripPurpose | null | undefined): string {
  switch (value) {
    case 'business':
      return 'İş';
    case 'private':
      return 'Özel';
    case 'commute':
      return 'İşe gidiş';
    default:
      return 'Sınıflandırılmadı';
  }
}

function isTripPurposeLocked(trip: FleetTripDetail | null): boolean {
  if (!trip?.endedAt) return false;
  const lockAt = new Date(trip.endedAt);
  lockAt.setDate(lockAt.getDate() + 7);
  return Date.now() > lockAt.getTime();
}

function flattenTimelineTrips(timeline: FleetTripTimelineResponse | null): FleetTripTimelineTrip[] {
  return timeline?.days.flatMap((day) => day.entries.filter((entry): entry is FleetTripTimelineTrip => entry.kind === 'trip')) ?? [];
}

export default function FleetTripsPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [timeline, setTimeline] = useState<FleetTripTimelineResponse | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<FleetTripDetail | null>(null);
  const [selectedTripLoading, setSelectedTripLoading] = useState(false);
  const [selectedTripError, setSelectedTripError] = useState<string | null>(null);
  const [selectedTripRefreshToken, setSelectedTripRefreshToken] = useState(0);
  const [selectedPurpose, setSelectedPurpose] = useState<TripPurpose>('business');
  const [selectedPurposeNote, setSelectedPurposeNote] = useState('');
  const [selectedPurposeContact, setSelectedPurposeContact] = useState('');
  const [selectedPurposeReason, setSelectedPurposeReason] = useState('');
  const [purposeSaving, setPurposeSaving] = useState(false);
  const [purposeError, setPurposeError] = useState<string | null>(null);

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

  const activeTrips = useMemo(() => flattenTimelineTrips(timeline), [timeline]);
  const firstGapTripId = useMemo(
    () => activeTrips.find((trip) => trip.dataGapDurationS != null)?.id ?? null,
    [activeTrips],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = monthRange(month);
      const result = await fleetTripsApi.list({
        ...range,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
      });
      setTimeline(result);
    } catch (e) {
      setTimeline(null);
      setError(getApiErrorMessage(e, t('fleetTrips.loadError', 'Sefer geçmişi yüklenemedi.')));
    } finally {
      setLoading(false);
    }
  }, [driverId, month, t, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!timeline) {
      setSelectedTripId(null);
      return;
    }

    const tripIds = new Set(activeTrips.map((trip) => trip.id));
    const firstTripId = activeTrips[0]?.id ?? null;

    if (!selectedTripId && firstTripId) {
      setSelectedTripId(firstTripId);
      return;
    }

    if (selectedTripId && !tripIds.has(selectedTripId)) {
      setSelectedTripId(firstTripId);
    }
  }, [activeTrips, selectedTripId, timeline]);

  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTrip(null);
      return;
    }

    let cancelled = false;
    setSelectedTripLoading(true);
    setSelectedTripError(null);

    void fleetTripsApi
      .getById(selectedTripId)
      .then((result) => {
        if (cancelled) return;
        setSelectedTrip(result);
      })
      .catch((e) => {
        if (cancelled) return;
        setSelectedTrip(null);
        setSelectedTripError(getApiErrorMessage(e, t('fleetTrips.loadError', 'Sefer geçmişi yüklenemedi.')));
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedTripLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTripId, selectedTripRefreshToken, t]);

  useEffect(() => {
    if (!selectedTrip) {
      setSelectedPurpose('business');
      setSelectedPurposeNote('');
      setSelectedPurposeContact('');
      setSelectedPurposeReason('');
      return;
    }

    setSelectedPurpose(selectedTrip.purpose ?? 'business');
    setSelectedPurposeNote(selectedTrip.purposeNote ?? '');
    setSelectedPurposeContact(selectedTrip.businessContact ?? '');
    setSelectedPurposeReason('');
  }, [selectedTrip]);

  const selectedTripPurposeLocked = useMemo(() => isTripPurposeLocked(selectedTrip), [selectedTrip]);

  const saveTripPurpose = useCallback(async () => {
    if (!selectedTripId || !selectedTrip || selectedTripPurposeLocked) return;

    setPurposeSaving(true);
    setPurposeError(null);

    try {
      const updated = await fleetTripsApi.setPurpose(selectedTripId, {
        purpose: selectedPurpose,
        note: selectedPurposeNote.trim() || undefined,
        businessContact: selectedPurposeContact.trim() || undefined,
        reason: selectedPurposeReason.trim() || undefined,
      });
      setSelectedTrip(updated);
      setSelectedTripRefreshToken((current) => current + 1);
      await load();
    } catch (error) {
      setPurposeError(getApiErrorMessage(error, t('fleetTrips.classifyError', 'Sefer sınıflandırılamadı.')));
    } finally {
      setPurposeSaving(false);
    }
  }, [load, selectedPurpose, selectedPurposeContact, selectedPurposeNote, selectedPurposeReason, selectedTrip, selectedTripId, selectedTripPurposeLocked, t]);

  const summary = useMemo(() => {
    const totalDistanceKm = timeline?.totalDistanceKm ?? 0;
    const totalDrivingS = timeline?.totalDrivingS ?? 0;
    return {
      totalTrips: timeline?.totalTrips ?? 0,
      totalDistanceKm,
      totalDrivingS,
      dataGapCount: timeline?.dataGapCount ?? 0,
    };
  }, [timeline]);

  const selectedTripSummary = useMemo(() => {
    if (!selectedTripId) return null;
    return activeTrips.find((trip) => trip.id === selectedTripId) ?? null;
  }, [activeTrips, selectedTripId]);

  const scrollToTrip = useCallback((tripId: string) => {
    setSelectedTripId(tripId);
    window.requestAnimationFrame(() => {
      document.getElementById(`trip-${tripId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const emptyStateTitle = vehicles.length === 0
    ? t('fleetTrips.emptyNoDevicesTitle', 'Cihazsız filo')
    : t('fleetTrips.noData', 'Seçilen dönemde sefer yok.');
  const emptyStateSubtitle = vehicles.length === 0
    ? t('fleetTrips.emptyNoDevicesSubtitle', 'Cihaz bağlayın → Cihazlar')
    : t('fleetTrips.emptySubtitle', 'Bu dönemde sürüş yok.');

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Route className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fleetTrips.title', 'Sefer geçmişi')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => downloadTripsCsv(activeTrips, vehicleLabels, driverLabels)}
            disabled={activeTrips.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('common.exportCsv', 'CSV exportieren')}
          </Button>
          <Button variant="outline" onClick={() => void load()}>
            {t('common.retry', 'Erneut versuchen')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Select className={FLEET_FILTER_SELECT} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
          <option value="">{t('fleetTrips.filterAllVehicles', 'Tüm araçlar')}</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate_number}
            </option>
          ))}
        </Select>
        <Select className={FLEET_FILTER_SELECT} value={driverId} onChange={(event) => setDriverId(event.target.value)}>
          <option value="">{t('fleetTrips.filterAllDrivers', 'Tüm sürücüler')}</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driverLabels.get(driver.id)}
            </option>
          ))}
        </Select>
        <div className="min-w-[10rem]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {t('fleetTrips.filterMonth', 'Ay')}
          </label>
          <Input
            type="month"
            className={`${FLEET_FILTER_INPUT} max-w-xs`}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="outline">{t('fleetTrips.source.phone', 'Telefon')}</Badge>
          <Badge variant="outline">{t('fleetTrips.source.device', 'Cihaz')}</Badge>
          <Badge variant="outline">{t('fleetTrips.source.api', 'API')}</Badge>
        </div>
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
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold">{summary.totalTrips}</p>
                <p className="text-sm text-slate-500">
                  {summary.totalDistanceKm.toFixed(1)} km · {formatFleetTripDurationSeconds(summary.totalDrivingS, t)}
                </p>
              </CardContent>
            </Card>

            <Card className={FLEET_LIST_CARD}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.classificationSoon', 'Sınıflandırma yakında')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 opacity-60">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>{t('fleetTrips.summary.classificationSoonLabel', 'İş / Özel / İşe gidiş')}</span>
                  <span>—</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-0 rounded-full bg-slate-300" />
                </div>
              </CardContent>
            </Card>

            <Card className={`${FLEET_LIST_CARD} hidden xl:block`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('fleetTrips.summary.unclassified', 'Sınıflandırılmamış')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-slate-400">13b</p>
              </CardContent>
            </Card>

            <Card
              className={`${FLEET_LIST_CARD} cursor-pointer border-amber-200 bg-amber-50/60 transition hover:border-amber-300 hover:bg-amber-50`}
              onClick={() => {
                if (firstGapTripId) scrollToTrip(firstGapTripId);
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-900">
                  {t('fleetTrips.summary.dataGaps', 'Veri boşluğu')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold text-amber-950">{summary.dataGapCount}</p>
                <p className="text-sm text-amber-800">
                  {firstGapTripId
                    ? t('fleetTrips.summary.dataGapJump', 'İlgili güne git')
                    : t('fleetTrips.summary.noDataGaps', 'Boşluk yok')}
                </p>
              </CardContent>
            </Card>
          </div>

          {timeline?.days.length ? (
            <div className="mt-6 space-y-4">
              {timeline.days.map((day) => (
                <DayTimelineCard
                  key={day.dayKey}
                  day={day}
                  vehicleLabels={vehicleLabels}
                  driverLabels={driverLabels}
                  selectedTripId={selectedTripId}
                  onSelectTrip={scrollToTrip}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MapPinned}
              title={emptyStateTitle}
              subtitle={emptyStateSubtitle}
              actionLabel={vehicles.length === 0 ? t('fleetTrips.goToVehicles', 'Cihazlar') : t('common.retry', 'Erneut versuchen')}
              onAction={() => {
                if (vehicles.length === 0) {
                  window.location.href = '/vehicles';
                  return;
                }
                void load();
              }}
            />
          )}

          <Card className={`${FLEET_LIST_CARD} mt-6`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>
                  {selectedTripSummary
                    ? t('fleetTrips.detail.titlePlate', 'Sefer — {{plate}}', {
                        plate: vehicleLabels.get(selectedTripSummary.vehicleId) ?? selectedTripSummary.vehicleId,
                      })
                    : t('fleetTrips.detail.title', 'Sefer detayı')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedTripSummary
                    ? `${driverLabels.get(selectedTripSummary.driverId) ?? selectedTripSummary.driverId} · ${formatTimeRange(selectedTripSummary.startedAt, selectedTripSummary.endedAt)}`
                    : t('fleetTrips.detail.selectHint', 'Kart seçerek rota haritasını açın.')}
                </p>
              </div>
              {selectedTripSummary ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/fleet-analytics/trips/${selectedTripSummary.id}`}>
                    {t('fleetTrips.openDetail', 'Harita')}
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {selectedTripLoading ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  {t('common.loading', 'Laden…')}
                </div>
              ) : selectedTripError ? (
                <EmptyState
                  icon={WifiOff}
                  title={t('common.error', 'Fehler')}
                  subtitle={selectedTripError}
                  actionLabel={t('common.retry', 'Erneut versuchen')}
                  onAction={() => {
                    if (selectedTripId) {
                      setSelectedTripRefreshToken((current) => current + 1);
                    }
                  }}
                />
              ) : selectedTrip ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="border-slate-200 bg-slate-50">
                      <CardContent className="space-y-1 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{t('fleetTrips.colDistance', 'Mesafe')}</p>
                        <p className="text-2xl font-semibold">{formatFleetTripDistance(selectedTrip.distanceKm)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50">
                      <CardContent className="space-y-1 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{t('fleetTrips.colDuration', 'Süre')}</p>
                        <p className="text-2xl font-semibold">{formatFleetTripDurationSeconds(selectedTrip.durationS, t)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50">
                      <CardContent className="space-y-1 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{t('fleetTrips.colAvgSpeed', 'Ort. hız')}</p>
                        <p className="text-2xl font-semibold">{formatFleetTripSpeed(selectedTrip.avgSpeedKmh)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50">
                      <CardContent className="space-y-1 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{t('fleetTrips.colScore', 'Skor')}</p>
                        <p className="text-2xl font-semibold">{formatFleetTripScore(selectedTrip.score)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div>
                      <Card className="border-slate-200 bg-white p-2">
                        <FleetTripRouteMap
                          locationPoints={selectedTrip.locationPoints}
                          drivingEvents={selectedTrip.drivingEvents}
                        />
                      </Card>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t('fleetTrips.detail.routePoints', '{{count}} GPS noktası', {
                          count: selectedTrip.locationPoints.length,
                        })}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <Card className="border-slate-200 bg-slate-50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            {t('fleetTrips.detail.eventCount', 'Olay sayısı')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-semibold">{selectedTrip.drivingEvents.length}</p>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200 bg-slate-50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            {t('fleetTrips.detail.classifyTitle', 'Fahrtenbuch sınıflandırması')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-wide text-slate-500">
                              {t('fleetTrips.detail.purpose', 'Amaç')}
                            </label>
                            <Select value={selectedPurpose} onChange={(event) => setSelectedPurpose(event.target.value as TripPurpose)} disabled={selectedTripPurposeLocked || purposeSaving}>
                              {TRIP_PURPOSE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-wide text-slate-500">
                              {t('fleetTrips.detail.note', 'Not')}
                            </label>
                            <Input
                              value={selectedPurposeNote}
                              onChange={(event) => setSelectedPurposeNote(event.target.value)}
                              placeholder={t('fleetTrips.detail.notePlaceholder', 'İş nedeni veya açıklama')}
                              disabled={selectedTripPurposeLocked || purposeSaving}
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-wide text-slate-500">
                              {t('fleetTrips.detail.businessContact', 'İş kişisi')}
                            </label>
                            <Input
                              value={selectedPurposeContact}
                              onChange={(event) => setSelectedPurposeContact(event.target.value)}
                              placeholder={t('fleetTrips.detail.businessContactPlaceholder', 'Müşteri / irtibat')}
                              disabled={selectedTripPurposeLocked || purposeSaving}
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-wide text-slate-500">
                              {t('fleetTrips.detail.reason', 'Sebep')}
                            </label>
                            <Input
                              value={selectedPurposeReason}
                              onChange={(event) => setSelectedPurposeReason(event.target.value)}
                              placeholder={t('fleetTrips.detail.reasonPlaceholder', 'İç denetim notu')}
                              disabled={selectedTripPurposeLocked || purposeSaving}
                            />
                          </div>
                          {purposeError ? <p className="text-sm text-red-600">{purposeError}</p> : null}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500">
                              {selectedTripPurposeLocked
                                ? t('fleetTrips.detail.locked', '7 gün sonra kilitlenir')
                                : t('fleetTrips.detail.editable', 'Düzenlenebilir')}
                            </p>
                            <Button onClick={() => void saveTripPurpose()} disabled={selectedTripPurposeLocked || purposeSaving || !selectedTrip}>
                              {purposeSaving ? t('common.loading', 'Laden…') : t('fleetTrips.detail.savePurpose', 'Kaydet')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                      {selectedTrip.dataGapDurationS != null ? (
                        <Card className="border-red-200 bg-red-50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-red-800">
                              {t('fleetTrips.summary.dataGapTitle', 'Veri boşluğu')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-1 text-sm text-red-800">
                            <p className="font-medium">
                              {selectedTrip.dataGapStartAt && selectedTrip.dataGapEndAt
                                ? `${formatTime(selectedTrip.dataGapStartAt)}–${formatTime(selectedTrip.dataGapEndAt)}`
                                : '—'}
                            </p>
                            <p>
                              {t('fleetTrips.summary.dataGapDetail', '{{minutes}} dk kayıt yok — cihaz kontrol edilmeli', {
                                minutes: Math.round((selectedTrip.dataGapDurationS ?? 0) / 60),
                              })}
                            </p>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  {t('fleetTrips.detail.selectHint', 'Kart seçerek rota haritasını açın.')}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function DayTimelineCard({
  day,
  vehicleLabels,
  driverLabels,
  selectedTripId,
  onSelectTrip,
  t,
}: {
  day: FleetTripTimelineDay;
  vehicleLabels: Map<string, string>;
  driverLabels: Map<string, string>;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <Card className={FLEET_LIST_CARD} id={`day-${day.dayKey}`}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {formatFleetDate(`${day.dayKey}T00:00:00.000Z`)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {day.tripCount} {t('fleetTrips.summary.totalTrips', { defaultValue: 'Sefer' })} · {day.totalKm.toFixed(1)} km · {formatFleetTripDurationSeconds(day.totalDrivingS, t)}
            </p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>
              ODO: {formatOdometerRange(day.dayOdoStartKm, day.dayOdoEndKm)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border-l border-slate-200 pl-4">
          {day.entries.map((entry, index) =>
            entry.kind === 'trip' ? (
              <TripTimelineCard
                key={entry.id}
                trip={entry}
                vehicleLabels={vehicleLabels}
                driverLabels={driverLabels}
                selectedTripId={selectedTripId}
                onSelectTrip={onSelectTrip}
                t={t}
              />
            ) : (
              <TripStopRow key={`${entry.afterTripId}-${entry.beforeTripId}`} stop={entry} />
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TripTimelineCard({
  trip,
  vehicleLabels,
  driverLabels,
  selectedTripId,
  onSelectTrip,
  t,
}: {
  trip: FleetTripTimelineTrip;
  vehicleLabels: Map<string, string>;
  driverLabels: Map<string, string>;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const isSelected = selectedTripId === trip.id;
  const startLabel = trip.routeStartLabel ?? t('fleetTrips.route.unknown', { defaultValue: 'Konum' });
  const endLabel = trip.routeEndLabel ?? t('fleetTrips.route.unknown', { defaultValue: 'Konum' });

  return (
    <button
      id={`trip-${trip.id}`}
      type="button"
      onClick={() => onSelectTrip(trip.id)}
      data-testid={`fleet-trip-card-${trip.id}`}
      className={`mb-3 block w-full rounded-xl border bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {formatTimeRange(trip.startedAt, trip.endedAt)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {startLabel} <ChevronRight className="inline-block h-3.5 w-3.5 text-slate-400" /> {endLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`fleetTrips.source.${trip.source}`, { defaultValue: trip.source })}</Badge>
          <Badge variant={trip.status === 'active' ? 'default' : 'secondary'}>
            {trip.status === 'active'
              ? t('fleetTrips.statusActive', { defaultValue: 'Aktif' })
              : t('fleetTrips.statusClosed', { defaultValue: 'Kapalı' })}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
        <p>
          {t('fleetTrips.colVehicle', { defaultValue: 'Araç' })}: {vehicleLabels.get(trip.vehicleId) ?? trip.vehicleId.slice(0, 8)}
        </p>
        <p>
          {t('fleetTrips.colDriver', { defaultValue: 'Sürücü' })}: {driverLabels.get(trip.driverId) ?? trip.driverId.slice(0, 8)}
        </p>
        <p>{formatFleetTripDistance(trip.distanceKm)}</p>
        <p>{formatFleetTripSpeed(trip.avgSpeedKmh)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>{t('fleetTrips.colScore', { defaultValue: 'Skor' })}: {formatFleetTripScore(trip.score)}</span>
        <span>{t('fleetTrips.detail.routePoints', { defaultValue: '{{count}} GPS noktası', count: trip.dataGapDurationS != null ? 1 : 0 })}</span>
        <span>ODO: {formatOdometerRange(trip.odoStartKm ?? null, trip.odoEndKm ?? null)}</span>
        <Badge variant={trip.purpose ? 'secondary' : 'outline'}>{formatTripPurposeLabel(trip.purpose ?? null)}</Badge>
      </div>

      {trip.dataGapDurationS != null ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {trip.dataGapStartAt && trip.dataGapEndAt
            ? `${formatTime(trip.dataGapStartAt)}–${formatTime(trip.dataGapEndAt)}`
            : '—'} · {t('fleetTrips.summary.dataGapDetail', {
              defaultValue: '{{minutes}} dk kayıt yok — cihaz kontrol edilmeli',
              minutes: Math.round((trip.dataGapDurationS ?? 0) / 60),
            })}
        </div>
      ) : null}
    </button>
  );
}

function TripStopRow({ stop }: { stop: FleetTripStopEntry }) {
  return (
    <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600" title={stop.tooltip}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-slate-500">⏱</span>
          <span>{stop.label}</span>
        </div>
        <div className="tabular-nums text-slate-500">
          {formatTimeRange(stop.startedAt, stop.endedAt)}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {Math.round(stop.durationS / 60)} dk
      </p>
      {stop.coordinates ? (
        <p className="mt-1 text-xs text-slate-500">
          {stop.coordinates.lat.toFixed(5)}, {stop.coordinates.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
