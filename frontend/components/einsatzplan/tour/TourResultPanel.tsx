'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage, toursApi, type TourDetail } from '@/lib/api';
import { formatDuration, orderedStops, tourSavings, unreachableStops } from '@/lib/tour-builder';
import { showToast } from '@/lib/toast';
import { TourRoutePreviewMap } from './TourRoutePreviewMap';

interface TourResultPanelProps {
  tour: TourDetail;
  onTourChange?: (tour: TourDetail) => void;
}

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Hesaplanmis turun sonucu: harita, ozet, durak listesi ve yayin onayi.
 *
 * Hem serbest duraklu TourBuilder hem gorev tabanli TourPlanningPanel bunu
 * kullanir — sonuc gorunumu ve "surucuye gonder" mantigi iki yerde
 * yazilmamali, iki kopya kacinilmaz sekilde birbirinden ayrisir.
 */
export function TourResultPanel({ tour, onTourChange }: TourResultPanelProps) {
  const { t } = useTranslation();
  const [releasing, setReleasing] = useState(false);

  const stops = orderedStops(tour);
  const savings = tourSavings(tour);
  const blocked = unreachableStops(tour);
  const units = { hour: t('tourBuilder.hourShort'), minute: t('tourBuilder.minuteShort') };
  const duration = formatDuration(tour.plannedDurationMin, units);
  const released = tour.status === 'released';

  async function release() {
    setReleasing(true);
    try {
      const updated = await toursApi.release(tour.id);
      onTourChange?.(updated);
      showToast({ message: t('tours.released'), type: 'success' });
    } catch (error) {
      showToast({ message: getApiErrorMessage(error, t('tours.releaseFailed')), type: 'error' });
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3" data-testid="tour-result">
      <TourRoutePreviewMap stops={stops} />

      <div className="flex flex-wrap gap-4 text-sm">
        <span className="font-semibold text-slate-900">
          {t('tourBuilder.totalStops', { count: stops.length })}
        </span>
        {tour.plannedDistanceKm !== null ? (
          <span className="text-slate-700">{Math.round(tour.plannedDistanceKm)} km</span>
        ) : null}
        {duration ? <span className="text-slate-700">{duration}</span> : null}
      </div>

      {savings ? (
        <p
          data-testid="tour-savings"
          className={
            savings.savedKm >= 0
              ? 'rounded-md bg-emerald-50 p-2 text-sm text-emerald-700'
              : 'rounded-md bg-amber-50 p-2 text-sm text-amber-700'
          }
        >
          {t(savings.savedKm >= 0 ? 'tourBuilder.saved' : 'tourBuilder.longer', {
            before: Math.round(savings.beforeKm),
            after: Math.round(savings.afterKm),
            diff: Math.abs(Math.round(savings.savedKm)),
            percent: Math.abs(Math.round(savings.percent)),
          })}
        </p>
      ) : null}

      {blocked.length > 0 ? (
        <p className="flex items-start gap-1 rounded-md bg-rose-50 p-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('tourBuilder.unreachableWarning', {
            count: blocked.length,
            addresses: blocked.map((stop) => stop.address).join(', '),
          })}
        </p>
      ) : null}

      <ol className="space-y-1">
        {stops.map((stop) => {
          const arrival = timeOf(stop.plannedArrivalAt);
          return (
            <li
              key={stop.id}
              data-testid="tour-result-stop"
              className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
                {stop.sequence}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-900">{stop.address}</span>
                <span className="text-xs text-slate-500">
                  {arrival ? t('tourBuilder.eta', { time: arrival }) : t('tourBuilder.etaUnknown')}
                  {stop.legDistanceKm !== null
                    ? ` · ${Math.round(stop.legDistanceKm)} km`
                    : ''}
                </span>
              </span>
              {stop.truckAccess === 'unreachable' ? (
                <span className="text-xs text-rose-600">{t('tours.stopUnreachable')}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {released ? (
        <p className="flex items-center gap-1 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          {t('tours.releasedNote')}
        </p>
      ) : (
        <Button type="button" onClick={() => void release()} disabled={releasing}>
          {releasing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {t('tourBuilder.approveAndSend')}
        </Button>
      )}
    </div>
  );
}
