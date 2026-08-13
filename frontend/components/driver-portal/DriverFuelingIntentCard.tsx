'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Fuel, Navigation, Route, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { formatPricePerLiter, formatStationAddress } from '@/lib/fuel-station-view';
import {
  formatExtraDistance,
  formatExtraDuration,
  formatStationEta,
} from '@/lib/fuel-station-route';
import { hasIntentRouteImpact } from '@/lib/fueling-intent-view';
import { buildNavigationUrl, detectMobilePlatform } from '@/lib/navigation-links';
import { cn } from '@/lib/utils';
import type { FuelingIntent } from '@/lib/types';

const TOUCH_TARGET = 'min-h-11';

interface DriverFuelingIntentCardProps {
  intent: FuelingIntent;
  /** "Tankstopp ändern" bir baglantiysa (tur ekrani) hedefi; yoksa dugme. */
  changeHref?: string;
  onChange?: () => void;
  onCancelled: () => void;
}

/**
 * Surucunun PLANLANAN yakit duragi.
 *
 * Ayni kart iki ekranda kullaniliyor (istasyon arama ve tur ekrani) — iki
 * kopya kacinilmaz sekilde ayrisirdi.
 *
 * BU BIR TUR DURAGI DEGILDIR ve karti okuyan surucu bunu gormeli: fiyat "arama
 * anindaki fiyat" olarak, varis "tahmini" olarak etiketleniyor ve musteri
 * duraklarinin sirasinin degismedigi acikca yaziliyor.
 */
export function DriverFuelingIntentCard({
  intent,
  changeHref,
  onChange,
  onCancelled,
}: DriverFuelingIntentCardProps) {
  const { t, i18n } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const platform = useMemo(() => detectMobilePlatform(), []);
  const navUrl = useMemo(
    () =>
      buildNavigationUrl(
        {
          latitude: intent.station.latitude,
          longitude: intent.station.longitude,
          label: intent.station.name,
        },
        platform,
      ),
    [intent.station.latitude, intent.station.longitude, intent.station.name, platform],
  );

  const address = formatStationAddress(intent.station.address);
  const price = formatPricePerLiter(intent.quotedPricePerLitre, i18n.language);
  const extraDistance = formatExtraDistance(intent.extraDistanceKm, i18n.language);
  const extraDuration = formatExtraDuration(intent.extraDurationMin, i18n.language);
  const eta = formatStationEta(intent.stationEta, i18n.language);

  /**
   * Navigasyon telemetrisi. Hatasi YUTULUYOR ve `await` EDILMIYOR: bu cagri
   * basarisiz olursa yol tarifi yine acilmali — surucuyu bir kayit ugruna
   * yolda birakmak kabul edilemez.
   */
  const handleNavigationOpened = () => {
    void driverPortalApi.markFuelingIntentNavigationOpened().catch(() => undefined);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await driverPortalApi.cancelFuelingIntent();
      onCancelled();
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <Card className="border-2 border-emerald-500 bg-emerald-50" data-testid="fueling-intent-card">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Fuel className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('driverPortal.fuelingIntent.title')}
        </p>

        <div>
          <p className="break-words font-semibold text-slate-900">{intent.station.name}</p>
          {intent.station.brand ? (
            <p className="break-words text-xs text-slate-600">{intent.station.brand}</p>
          ) : null}
          {address ? <p className="break-words text-sm text-slate-700">{address}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="success">
            {t(`driverPortal.fuelStations.products.${intent.selectedFuelProduct}`)}
          </Badge>
          {intent.plannedLitres !== null ? (
            <Badge variant="outline">
              {t('driverPortal.fuelingIntent.plannedLitres', { litres: intent.plannedLitres })}
            </Badge>
          ) : null}
        </div>

        <dl className="space-y-0.5 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-600">{t('driverPortal.fuelingIntent.quotedPrice')}</dt>
            <dd className={cn('font-semibold', !price && 'font-normal text-slate-500')}>
              {price ?? t('driverPortal.fuelStations.priceUnavailable')}
            </dd>
          </div>
          {/* Bunun ODENEN fiyat olmadigi acikca yaziliyor. */}
          <p className="text-xs text-slate-500">{t('driverPortal.fuelingIntent.quotedPriceNote')}</p>

          {hasIntentRouteImpact(intent) ? (
            <div className="flex items-start gap-1.5 pt-1">
              <Route className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t('driverPortal.fuelStations.routeImpact', {
                  distance: extraDistance ?? '—',
                  duration: extraDuration ?? '—',
                })}
              </span>
            </div>
          ) : null}
          {eta ? (
            <div className="flex items-start gap-1.5">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('driverPortal.fuelStations.stationEta', { time: eta })}</span>
            </div>
          ) : null}
        </dl>

        {/* Musteri duraklarinin sirasinin DEGISMEDIGI her zaman yaziyor. */}
        <p className="rounded-md border border-slate-300 bg-white/70 p-2 text-xs text-slate-700">
          {t('driverPortal.fuelingIntent.doesNotChangeTour')}
        </p>

        <div className="space-y-2 pt-1">
          <Button
            asChild={Boolean(navUrl)}
            disabled={!navUrl}
            className={cn('w-full bg-[#1a4d7a] hover:bg-[#163a5c]', TOUCH_TARGET)}
          >
            {navUrl ? (
              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleNavigationOpened}
              >
                <Navigation className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('driverPortal.fuelingIntent.openNavigation')}
              </a>
            ) : (
              <span>{t('driverPortal.fuelStations.noCoordinates')}</span>
            )}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            {changeHref ? (
              <Button asChild variant="outline" className={cn('w-full', TOUCH_TARGET)}>
                <Link href={changeHref}>{t('driverPortal.fuelingIntent.change')}</Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={cn('w-full', TOUCH_TARGET)}
                onClick={onChange}
              >
                {t('driverPortal.fuelingIntent.change')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className={cn('w-full border-red-300 text-red-700', TOUCH_TARGET)}
              disabled={cancelling}
              onClick={() => setConfirmCancel(true)}
            >
              <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('driverPortal.fuelingIntent.cancel')}
            </Button>
          </div>

          {/* Eldivenli parmak yanlis dokunur: iptal ikinci bir onay istiyor. */}
          {confirmCancel ? (
            <div className="space-y-2 rounded-md border border-red-300 bg-white p-3">
              <p className="text-sm text-slate-800">
                {t('driverPortal.fuelingIntent.cancelConfirm', { station: intent.station.name })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn('w-full', TOUCH_TARGET)}
                  disabled={cancelling}
                  onClick={() => setConfirmCancel(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  className={cn('w-full bg-red-600 text-white hover:bg-red-700', TOUCH_TARGET)}
                  disabled={cancelling}
                  onClick={() => void handleCancel()}
                >
                  {t('driverPortal.fuelingIntent.cancelConfirmAction')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
