'use client';

import { Clock, Fuel, MapPin, Route, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { formatPricePerLiter, formatStationAddress } from '@/lib/fuel-station-view';
import { formatExtraDistance, formatExtraDuration } from '@/lib/fuel-station-route';
import { hasIntentRouteImpact } from '@/lib/fueling-intent-view';
import type { FuelingIntent } from '@/lib/types';

function timeOf(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

/**
 * Ofisin gordugu yakit duragi — SALT OKUNUR.
 *
 * Tur detayinin ICINDE duruyor, ayri bir dashboard acilmadi: planlamaci turu
 * incelerken "surucu nereye sapiyor" sorusunun cevabini ayni ekranda gormeli.
 *
 * Bilincli olarak HICBIR aksiyon yok. Ofis bu fazda surucunun secimini
 * degistiremez, iptal edemez ve musteri tur sirasina ekleyemez — backend'de
 * yazma ucu de yok. Rol farki bu yuzden gorunum katmaninda degil: okuma yetkisi
 * olan her operasyonel rol (accounting dahil) ayni salt okunur karti gorur.
 */
export function TourFuelingIntentPanel({ intent }: { intent: FuelingIntent | null }) {
  const { t, i18n } = useTranslation();

  if (!intent) return null;

  const address = formatStationAddress(intent.station.address);
  const price = formatPricePerLiter(intent.quotedPricePerLitre, i18n.language);
  const selectedAt = timeOf(intent.selectedAt, i18n.language);
  const eta = timeOf(intent.stationEta, i18n.language);

  return (
    <section
      data-testid="tour-fueling-intent"
      className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Fuel className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('tours.fuelingIntent.title')}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Durum METINLE yaziliyor; renk tek basina anlam tasimiyor. */}
        <Badge variant="success">{t(`tours.fuelingIntent.status.${intent.status}`)}</Badge>
        <Badge variant="outline">
          {t(`driverPortal.fuelStations.products.${intent.selectedFuelProduct}`)}
        </Badge>
        {intent.plannedLitres !== null ? (
          <Badge variant="outline">
            {t('tours.fuelingIntent.plannedLitres', { litres: intent.plannedLitres })}
          </Badge>
        ) : null}
      </div>

      <dl className="space-y-1 text-sm text-slate-700">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            {t('tours.fuelingIntent.stationLabel')}
          </dt>
          <dd className="break-words font-semibold text-slate-900">{intent.station.name}</dd>
          {address ? (
            <dd className="flex items-start gap-1.5 break-words text-slate-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{address}</span>
            </dd>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{intent.vehiclePlateNumber ?? t('tours.fuelingIntent.vehicleUnknown')}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-600">{t('tours.fuelingIntent.quotedPrice')}</dt>
          <dd className="font-semibold text-slate-900">
            {price ?? t('driverPortal.fuelStations.priceUnavailable')}
          </dd>
        </div>
        {/* Odenen fiyat DEGIL — fis akisi gercek tutari getirecek. */}
        <p className="text-xs text-slate-500">{t('tours.fuelingIntent.quotedPriceNote')}</p>

        {hasIntentRouteImpact(intent) ? (
          <div className="flex items-start gap-1.5">
            <Route className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t('driverPortal.fuelStations.routeImpact', {
                distance: formatExtraDistance(intent.extraDistanceKm, i18n.language) ?? '—',
                duration: formatExtraDuration(intent.extraDurationMin, i18n.language) ?? '—',
              })}
            </span>
          </div>
        ) : null}

        {selectedAt ? (
          <div className="flex items-start gap-1.5">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('tours.fuelingIntent.selectedAt', { time: selectedAt })}</span>
          </div>
        ) : null}
        {eta ? <p className="text-xs text-slate-600">{t('tours.fuelingIntent.eta', { time: eta })}</p> : null}
      </dl>

      {/* Turun sirasinin degismedigi ofis tarafinda da yaziyor. */}
      <p className="rounded border border-slate-300 bg-white/70 p-2 text-xs text-slate-700">
        {t('tours.fuelingIntent.doesNotChangeTour')}
      </p>
    </section>
  );
}
