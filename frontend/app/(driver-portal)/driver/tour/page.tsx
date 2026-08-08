'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, MapPin, Navigation, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { buildNavigationUrl, detectMobilePlatform } from '@/lib/navigation-links';
import { cn } from '@/lib/utils';
import type { DriverTour, DriverTourStop } from '@/lib/types';

/**
 * The day's tour, stop by stop.
 *
 * Read-only on purpose: `driver/tours` exposes only `GET today`, so there is no
 * way for the driver to mark a stop as reached yet. Rather than fake a control
 * that does not persist, this screen shows the plan and hands the next leg to
 * the phone's map app. Marking progress needs new endpoints (plan step 7).
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
            <Card key={stop.id} className="border-slate-200 bg-white">
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
                  disabled={!navUrl}
                  variant="outline"
                  className={cn('mt-3 h-11 w-full', !navUrl && 'opacity-50')}
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
              </CardContent>
            </Card>
          );
        })}

        <p className="px-1 text-xs text-slate-500">{t('driverPortal.tour.readOnlyNote')}</p>
      </div>
    );
  };

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('driverPortal.tour.title')}</h1>
      {body()}
    </DriverPortalShell>
  );
}
