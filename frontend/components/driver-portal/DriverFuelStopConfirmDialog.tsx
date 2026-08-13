'use client';

import { AlertTriangle, Fuel } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatPricePerLiter, formatStationAddress, priceFor } from '@/lib/fuel-station-view';
import { formatExtraDistance, formatExtraDuration } from '@/lib/fuel-station-route';
import { cn } from '@/lib/utils';
import type { FuelProductType, RouteRecommendationStation } from '@/lib/types';

const TOUCH_TARGET = 'min-h-11';

interface DriverFuelStopConfirmDialogProps {
  station: RouteRecommendationStation | null;
  selectedProduct: FuelProductType;
  plannedLitres: number | null;
  /** Halihazirda baska bir istasyon secili mi — "degistirme" onayi icin. */
  replacingStationName: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Yakit duragi secmeden onceki onay.
 *
 * Neden onay: bu secim ofise bildirim gonderir ve surucunun rotasini
 * degistirir. Tek dokunusla, hangi yakiti ve hangi fiyati sectigini gormeden
 * gonderilmemeli — ozellikle eldivenle kullanilan bir ekranda.
 *
 * Fiyat ACIKCA "arama anindaki fiyat" olarak etiketleniyor: pompada odenecek
 * tutar bu degildir ve ekranda oyle sunulmasi, sonradan fis karsilastirmasinda
 * "sistem yanlis fiyat gosterdi" itirazina yol acar.
 */
export function DriverFuelStopConfirmDialog({
  station,
  selectedProduct,
  plannedLitres,
  replacingStationName,
  busy,
  onConfirm,
  onClose,
}: DriverFuelStopConfirmDialogProps) {
  const { t, i18n } = useTranslation();

  if (!station) return null;

  const address = formatStationAddress(station.address);
  const price = formatPricePerLiter(priceFor(station, selectedProduct), i18n.language);
  const extraDistance = formatExtraDistance(station.routeMetrics.extraDistanceKm, i18n.language);
  const extraDuration = formatExtraDuration(station.routeMetrics.extraDurationMin, i18n.language);
  const hasRouteImpact = Boolean(extraDistance || extraDuration);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md" data-testid="fuel-stop-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-4 w-4 shrink-0" aria-hidden="true" />
            {replacingStationName
              ? t('driverPortal.fuelingIntent.confirmChangeTitle')
              : t('driverPortal.fuelingIntent.confirmTitle')}
          </DialogTitle>
          <DialogDescription>
            {replacingStationName
              ? t('driverPortal.fuelingIntent.confirmChangeBody', {
                  station: replacingStationName,
                })
              : t('driverPortal.fuelingIntent.confirmBody')}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-1 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {t('driverPortal.fuelingIntent.stationLabel')}
            </dt>
            <dd className="break-words font-semibold text-slate-900">{station.name}</dd>
            {address ? <dd className="break-words text-slate-600">{address}</dd> : null}
          </div>

          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-600">{t('driverPortal.fuelStations.fuelLabel')}</dt>
            <dd className="font-semibold text-slate-900">
              {t(`driverPortal.fuelStations.products.${selectedProduct}`)}
            </dd>
          </div>

          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-600">{t('driverPortal.fuelingIntent.quotedPrice')}</dt>
            <dd className={cn('font-semibold text-slate-900', !price && 'font-normal text-slate-500')}>
              {price ?? t('driverPortal.fuelStations.priceUnavailable')}
            </dd>
          </div>
          <p className="text-xs text-slate-500">{t('driverPortal.fuelingIntent.quotedPriceNote')}</p>

          {plannedLitres !== null ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-600">
                {t('driverPortal.fuelStations.plannedLitresLabel')}
              </dt>
              <dd className="font-semibold text-slate-900">
                {t('driverPortal.fuelingIntent.plannedLitres', { litres: plannedLitres })}
              </dd>
            </div>
          ) : null}

          {hasRouteImpact ? (
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-600">{t('driverPortal.fuelingIntent.routeImpactLabel')}</dt>
              <dd className="text-right font-semibold text-slate-900">
                {t('driverPortal.fuelStations.routeImpact', {
                  distance: extraDistance ?? '—',
                  duration: extraDuration ?? '—',
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Musteri duraklarinin sirasinin DEGISMEDIGI onaydan once yaziyor. */}
        <p className="flex items-start gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('driverPortal.fuelingIntent.doesNotChangeTour')}</span>
        </p>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn('w-full sm:w-auto', TOUCH_TARGET)}
            disabled={busy}
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            className={cn('w-full bg-[#1a4d7a] hover:bg-[#163a5c] sm:w-auto', TOUCH_TARGET)}
            disabled={busy}
            onClick={onConfirm}
          >
            {replacingStationName
              ? t('driverPortal.fuelingIntent.confirmChangeAction')
              : t('driverPortal.fuelingIntent.confirmAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
