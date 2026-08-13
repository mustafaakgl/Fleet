'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, Fuel, MapPin, Navigation, Route, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFuelingIntentCard } from '@/components/driver-portal/DriverFuelingIntentCard';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useActiveFuelingIntent } from '@/hooks/useActiveFuelingIntent';
import { driverPortalApi } from '@/lib/api';
import { enqueueTourStopMarkQueueItem } from '@/lib/driver-offline-queue';
import { isQueueableOfflineError } from '@/lib/driver-offline-queue-core';
import { buildNavigationUrl, detectMobilePlatform } from '@/lib/navigation-links';
import { cn } from '@/lib/utils';
import type { DriverTour, DriverTourStop, DriverTourStopStatus } from '@/lib/types';

/**
 * Best-effort position for the marking. Never blocks the tap: if the driver
 * denied location or the fix is slow, the stop is still marked — a timestamp
 * without coordinates beats no record at all.
 */
async function currentPosition(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 4000, maximumAge: 60000 },
    );
  });
}

/**
 * The day's tour, stop by stop, with the driver marking progress.
 *
 * A marking is held in the offline queue when there is no signal — losing
 * reception mid-tour is the normal case, not an error — and the queue item id
 * travels as `client_event_id` so a reconnect cannot apply the same tap twice.
 */

function formatWindow(stop: DriverTourStop): string | null {
  if (!stop.windowStart && !stop.windowEnd) return null;
  return [stop.windowStart, stop.windowEnd].filter(Boolean).join(' – ');
}

function formatArrival(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function DriverTourPage() {
  const { t, i18n } = useTranslation();
  const [tour, setTour] = useState<DriverTour | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyStopId, setBusyStopId] = useState<string | null>(null);
  const [queuedStopIds, setQueuedStopIds] = useState<string[]>([]);
  /**
   * Planlanan yakit duragi. Turdan AYRI okunuyor: bir TourStop degil ve tur
   * yuklenemese bile gosterilebilir olmali.
   */
  const { intent: fuelingIntent, setIntent: setFuelingIntent } = useActiveFuelingIntent();

  useEffect(() => {
    let active = true;
    driverPortalApi
      .todayTour()
      .then((result) => {
        if (active) setTour(result);
      })
      .catch(() => {
        if (active) setError(t('driverPortal.tour.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const applyLocalStatus = useCallback((stopId: string, status: DriverTourStopStatus) => {
    setTour((prev) =>
      prev
        ? {
            ...prev,
            stops: prev.stops.map((s) => (s.id === stopId ? { ...s, status } : s)),
          }
        : prev,
    );
  }, []);

  const handleMark = useCallback(
    async (stopId: string, status: Exclude<DriverTourStopStatus, 'pending'>) => {
      setBusyStopId(stopId);
      setError(null);
      const position = await currentPosition();
      try {
        await driverPortalApi.markTourStop(stopId, {
          status,
          occurred_at: new Date().toISOString(),
          ...position,
        });
        applyLocalStatus(stopId, status);
      } catch (err) {
        // No signal is the normal case in a cab, not an error: hold the marking
        // and let the queue send it when the connection returns.
        if (isQueueableOfflineError(err)) {
          await enqueueTourStopMarkQueueItem({
            stopId,
            status,
            occurredAt: new Date().toISOString(),
            ...position,
          });
          applyLocalStatus(stopId, status);
          setQueuedStopIds((prev) => (prev.includes(stopId) ? prev : [...prev, stopId]));
        } else {
          setError(t('driverPortal.tour.markFailed'));
        }
      } finally {
        setBusyStopId(null);
      }
    },
    [applyLocalStatus, t],
  );

  const handleReset = useCallback(
    async (stopId: string) => {
      setBusyStopId(stopId);
      setError(null);
      try {
        await driverPortalApi.resetTourStop(stopId);
        applyLocalStatus(stopId, 'pending');
        setQueuedStopIds((prev) => prev.filter((id) => id !== stopId));
      } catch {
        setError(t('driverPortal.tour.markFailed'));
      } finally {
        setBusyStopId(null);
      }
    },
    [applyLocalStatus, t],
  );

  const platform = useMemo(() => detectMobilePlatform(), []);
  const stops = useMemo(
    () => [...(tour?.stops ?? [])].sort((a, b) => a.sequence - b.sequence),
    [tour],
  );

  const body = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      );
    }

    if (error) {
      return <p className="text-sm text-red-700">{error}</p>;
    }

    // A draft tour is withheld by the backend, so "no tour" also covers
    // "the dispatcher has not released it yet".
    if (!tour || stops.length === 0) {
      return (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <p className="font-medium text-slate-900">{t('driverPortal.tour.emptyTitle')}</p>
            <p className="mt-1 text-sm text-slate-600">{t('driverPortal.tour.emptyBody')}</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            {/* Not uppercased: this is a proper name, and Turkish casing rules
                turn "Berlin" into "BERLİN". Labels may shout, data may not. */}
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Route className="h-4 w-4" />
              {tour.name ?? t('driverPortal.tour.title')}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {t('driverPortal.tour.summary', {
                stops: stops.length,
                km: tour.plannedDistanceKm !== null ? Math.round(tour.plannedDistanceKm) : '—',
              })}
            </p>
            {/* Navigasyon aksiyonlarinin yanina konuldu: surucu rotayi burada
                aciyor, yakit ihtiyaci da ayni anda ortaya cikiyor. Konum izni
                BURADA istenmiyor — hedef ekranda, surucu arama baslatinca. */}
            <Button asChild variant="outline" className="mt-3 h-11 w-full">
              <Link href="/driver/fuel-stations">
                <Fuel className="mr-2 h-4 w-4" />
                {t('driverPortal.fuelStations.findAction')}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {stops.map((stop) => {
          const navUrl =
            stop.latitude !== null && stop.longitude !== null
              ? buildNavigationUrl(
                  { latitude: stop.latitude, longitude: stop.longitude, label: stop.city },
                  platform,
                )
              : null;
          const windowLabel = formatWindow(stop);
          const arrival = formatArrival(stop.plannedArrivalAt, i18n.language);

          return (
            <Card
              key={stop.id}
              className={cn(
                'border-slate-200 bg-white',
                stop.status === 'completed' || stop.status === 'skipped' ? 'opacity-60' : null,
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-900 text-sm font-bold text-white">
                    {stop.sequence + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t(`driverPortal.tour.kind.${stop.kind}`, stop.kind)}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {stop.street || stop.address || t('driverPortal.tour.addressUnknown')}
                    </p>
                    <p className="text-sm text-slate-600">
                      {[stop.postalCode, stop.city].filter(Boolean).join(' ')}
                    </p>

                    <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
                      {windowLabel ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{windowLabel}</span>
                        </div>
                      ) : null}
                      {arrival ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{t('driverPortal.tour.plannedArrival', { time: arrival })}</span>
                        </div>
                      ) : null}
                    </dl>

                    {/* Mirrors the mobile screen: 'unreachable' is a finding,
                        anything short of 'reachable' is merely unconfirmed. */}
                    {stop.truckAccess === 'unreachable' ? (
                      <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {t('driverPortal.tour.truckUnreachable')}
                      </p>
                    ) : stop.truckAccess !== 'reachable' ? (
                      <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {t('driverPortal.tour.truckAccessWarning')}
                      </p>
                    ) : null}
                  </div>
                </div>

                <Button
                  asChild={Boolean(navUrl)}
                  disabled={!navUrl || stop.status === 'completed'}
                  variant="outline"
                  className={cn('mt-3 h-11 w-full', (!navUrl || stop.status === 'completed') && 'opacity-50')}
                >
                  {navUrl ? (
                    <a href={navUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="mr-2 h-4 w-4" />
                      {t('driverPortal.tour.navigate')}
                    </a>
                  ) : (
                    <span>{t('driverPortal.tour.noCoordinates')}</span>
                  )}
                </Button>

                {stop.status === 'pending' ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={busyStopId === stop.id}
                      onClick={() => void handleMark(stop.id, 'arrived')}
                    >
                      {t('driverPortal.tour.markArrived')}
                    </Button>
                    <Button
                      type="button"
                      className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={busyStopId === stop.id}
                      onClick={() => void handleMark(stop.id, 'completed')}
                    >
                      {t('driverPortal.tour.markCompleted')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <Check className="h-4 w-4" />
                      {t(`driverPortal.tour.status.${stop.status}`)}
                      {queuedStopIds.includes(stop.id) ? (
                        <span className="text-xs font-normal text-amber-700">
                          · {t('driverPortal.tour.queued')}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex gap-2">
                      {stop.status === 'arrived' ? (
                        <Button
                          type="button"
                          className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={busyStopId === stop.id}
                          onClick={() => void handleMark(stop.id, 'completed')}
                        >
                          {t('driverPortal.tour.markCompleted')}
                        </Button>
                      ) : null}
                      {/* Eldivenle yanlis dokunus olur; geri alma her zaman acik. */}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={busyStopId === stop.id}
                        onClick={() => void handleReset(stop.id)}
                      >
                        <Undo2 className="mr-1.5 h-4 w-4" />
                        {t('driverPortal.tour.undo')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {error ? <p className="px-1 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  };

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('driverPortal.tour.title')}</h1>
      {/* Planlanan yakit duragi. Durak listesinin DISINDA ve numarasiz: bir
          musteri duragi degil, sirayi degistirmiyor ve tur yuklenemese bile
          gorunuyor. "Degistir" istasyon ekranina goturur. */}
      {fuelingIntent ? (
        <div className="mb-3">
          <DriverFuelingIntentCard
            intent={fuelingIntent}
            changeHref="/driver/fuel-stations"
            onCancelled={() => setFuelingIntent(null)}
          />
        </div>
      ) : null}
      {body()}
    </DriverPortalShell>
  );
}
