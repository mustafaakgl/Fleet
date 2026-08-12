'use client';

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Clock,
  Fuel,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DriverFuelStationsMap } from '@/components/driver-portal/DriverFuelStationsMap';
import { driverPortalApi } from '@/lib/api';
import {
  resolveDriverPosition,
  type DriverPosition,
} from '@/lib/driver-geolocation';
import {
  DEFAULT_FUEL_STATION_RADIUS_KM,
  FUEL_STATION_RADIUS_OPTIONS,
  cheapestStationId,
  formatDistance,
  formatPricePerLiter,
  formatRetrievedAt,
  formatStationAddress,
  fuelStationErrorKey,
  geolocationErrorKey,
  nearestStationId,
  priceFor,
  selectableProducts,
  visibleOfferings,
} from '@/lib/fuel-station-view';
import {
  MAX_PLANNED_LITRES,
  MIN_PLANNED_LITRES,
  ROUTE_SORT_MODES,
  defaultRouteSortMode,
  estimateDetourOperatingCost,
  estimatePurchaseCost,
  estimateStationChoiceCost,
  formatCurrencyEur,
  formatDriveTime,
  formatExtraDistance,
  formatExtraDuration,
  formatRoadDistance,
  formatStationEta,
  hasRouteMetrics,
  isEconomicComparisonAvailable,
  isPlannedLitresValid,
  isRouteSortAvailable,
  parseLitresInput,
  recommendedStationId,
  sortRouteStations,
  type FuelStationRouteSortMode,
} from '@/lib/fuel-station-route';
import { buildNavigationUrl, detectMobilePlatform } from '@/lib/navigation-links';
import { cn } from '@/lib/utils';
import type {
  FuelProductType,
  RouteRecommendationStation,
  RouteRecommendationsResponse,
} from '@/lib/types';

/** Dokunma hedefi en az ~44px: eldivenli parmak icin alt sinir. */
const TOUCH_TARGET = 'min-h-11';

/**
 * Harita cokerse LISTE calismaya devam etmeli.
 *
 * Leaflet jsdom'da ve bazi eski WebView'larda patlayabiliyor; haritanin bir
 * istisnasi surucuyu fiyat listesinden mahrum birakmamali. React'te bunun tek
 * yolu bir hata siniri (class bileseni).
 */
class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type ScreenError =
  | { kind: 'location'; messageKey: string }
  | { kind: 'provider'; messageKey: string };

/**
 * Surucunun yakinindaki, aracina UYAN akaryakit istasyonlari.
 *
 * ILK RENDERDA HICBIR ISTEK YOK: ne konum izni ne de API cagrisi. Surucu
 * "Tankstelle finden"e basana kadar hicbir sey olmuyor — sayfa acilisinda izin
 * diyalogu acmak, kota harcamak ve arka planda polling yapmak bilincli olarak
 * DISARIDA.
 *
 * Arac istekte GONDERILMEZ; sunucu oturumdaki surucuye gore cozer.
 */
export function DriverFuelStationsScreen() {
  const { t, i18n } = useTranslation();

  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [data, setData] = useState<RouteRecommendationsResponse | null>(null);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_FUEL_STATION_RADIUS_KM);
  const [sortMode, setSortMode] = useState<FuelStationRouteSortMode>('distance');
  /**
   * Planlanan litre — YALNIZCA ekran state'i. Veritabanina yazilmiyor ve
   * degismesi hicbir backend/provider/routing istegi acmiyor.
   */
  const [plannedLitresInput, setPlannedLitresInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<FuelProductType | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  /** Bekleyen istegi iptal etmek icin; unmount ve yeni aramada kullaniliyor. */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Istek sayaci. Eski bir yanit yenisinin uzerine YAZMAMALI: iptal edilse bile
   * ag yaniti yarista onde olabilir, bu yuzden sira numarasi da kontrol ediliyor.
   */
  const requestSeqRef = useRef(0);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      // Ekrandan cikilirken bekleyen istek iptal ediliyor.
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const runSearch = useCallback(
    async (origin: DriverPosition, requestedRadiusKm: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;

      setSearching(true);
      setError(null);
      try {
        const response = await driverPortalApi.routeRecommendedFuelStations(
          {
            latitude: origin.latitude,
            longitude: origin.longitude,
            radiusKm: requestedRadiusKm,
          },
          controller.signal,
        );
        // Yaris korumasi: bu yanit en son istege ait degilse YOK SAYILIR.
        if (seq !== requestSeqRef.current) return;

        setData(response);
        setSelectedStationId(null);
        const products = selectableProducts(
          response.vehicle.compatibleProducts,
          response.providerSupportedProducts,
        );
        // Tek uyumlu urun varsa fiyat siralamasi anlamli olsun diye secili
        // baslatiliyor; birden fazlaysa surucu secer.
        setSelectedProduct(products.length === 1 ? products[0]! : null);
        // Varsayilan siralama sunucudan gelen baglama gore: aktif tur ve
        // hesaplanmis metrik varsa "en az rota sapmasi", aksi halde mesafe.
        setSortMode(
          defaultRouteSortMode({
            mode: response.routeContext.mode,
            anyRouteMetrics: response.stations.some(hasRouteMetrics),
          }),
        );
      } catch (caught) {
        if (seq !== requestSeqRef.current) return;
        if (controller.signal.aborted) return;

        const knownKey = fuelStationErrorKey(caught);
        setError({
          kind: 'provider',
          messageKey: knownKey ?? 'driverPortal.fuelStations.errors.generic',
        });
      } finally {
        if (seq === requestSeqRef.current) {
          setSearching(false);
        }
      }
    },
    [],
  );

  /** Surucunun acik aksiyonu: once konum, sonra arama. */
  const handleFind = useCallback(
    async (options?: { forceFresh?: boolean; radiusKm?: number }) => {
      if (locating || searching) return;

      setLocating(true);
      setError(null);
      try {
        const resolved = await resolveDriverPosition({ forceFresh: options?.forceFresh });
        if (!resolved.ok) {
          // Yaklasik/uydurma konuma DUSULMEZ.
          setError({ kind: 'location', messageKey: geolocationErrorKey(resolved.reason) });
          return;
        }
        setPosition(resolved.position);
        await runSearch(resolved.position, options?.radiusKm ?? radiusKm);
      } finally {
        setLocating(false);
      }
    },
    [locating, radiusKm, runSearch, searching],
  );

  const stations = useMemo(() => data?.stations ?? [], [data]);

  const products = useMemo(
    () =>
      data
        ? selectableProducts(
            data.vehicle.compatibleProducts,
            data.providerSupportedProducts,
          )
        : [],
    [data],
  );

  const anyRouteMetrics = useMemo(() => stations.some(hasRouteMetrics), [stations]);

  const sorted = useMemo(
    () => sortRouteStations(stations, sortMode, selectedProduct),
    [selectedProduct, sortMode, stations],
  );

  const nearestId = useMemo(() => nearestStationId(sorted), [sorted]);
  const cheapestId = useMemo(
    () => cheapestStationId(sorted, selectedProduct),
    [selectedProduct, sorted],
  );
  /**
   * "Onerilen" — secili olcute gore ilk UYGUN istasyon. "En ucuz" ve
   * "En yakin" ile ayni sey DEGIL: kapali istasyon onerilmez.
   */
  const recommendedId = useMemo(
    () => recommendedStationId(sorted, sortMode, selectedProduct),
    [selectedProduct, sortMode, sorted],
  );

  const plannedLitres = useMemo(
    () => parseLitresInput(plannedLitresInput, i18n.language),
    [i18n.language, plannedLitresInput],
  );
  const plannedLitresValid = plannedLitres === null ? plannedLitresInput.trim() === '' : isPlannedLitresValid(plannedLitres);
  /** Guvenilir arac tuketimi yoksa ekonomik toplam HIC sunulmuyor. */
  const economicAvailable = isEconomicComparisonAvailable(
    data?.vehicle.avgConsumptionLPer100Km ?? null,
  );

  const selectedStation = useMemo(
    () => sorted.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId, sorted],
  );

  const platform = useMemo(() => detectMobilePlatform(), []);

  const handleSelectStation = useCallback((stationId: string) => {
    setSelectedStationId((current) => (current === stationId ? null : stationId));
  }, []);

  useEffect(() => {
    if (selectedStation && summaryRef.current) {
      // Marker'dan secildiginde ozet karti odaga aliniyor — klavye ve ekran
      // okuyucu kullanicisi secimin nereye gittigini kaybetmesin.
      summaryRef.current.focus();
    }
  }, [selectedStation]);

  const busy = locating || searching;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('driverPortal.fuelStations.intro')}</p>

      {/* Ana aksiyon. Ilk renderda hicbir istek yok; her sey buna bagli. */}
      <Button
        type="button"
        className={cn('w-full bg-[#1a4d7a] hover:bg-[#163a5c]', TOUCH_TARGET)}
        disabled={busy}
        onClick={() => void handleFind()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {locating
          ? t('driverPortal.fuelStations.locating')
          : searching
            ? t('driverPortal.fuelStations.searching')
            : t('driverPortal.fuelStations.findAction')}
      </Button>

      {error ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <p role="alert" className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t(error.messageKey)}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              className={cn('w-full', TOUCH_TARGET)}
              disabled={busy}
              onClick={() => void handleFind({ forceFresh: error.kind === 'location' })}
            >
              {t('driverPortal.fuelStations.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {searching && !data ? (
        <div className="space-y-3" data-testid="fuel-stations-skeleton">
          <div className="h-64 animate-pulse rounded-lg bg-slate-100 sm:h-80" />
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-4">
          {/* Demo isaretlemesi backend'in dataMode alanina gore — frontend
              env degiskenine gore DEGIL. */}
          {data.dataMode === 'mock' ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('driverPortal.fuelStations.demoBanner')}</span>
            </p>
          ) : null}

          {/* Aktif tur baglami: hangi duraga gore sapma hesaplandigi. */}
          {data.routeContext.mode === 'active_tour' && data.routeContext.nextStop ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Route className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('driverPortal.fuelStations.routeBasedTitle')}
              </p>
              {/* break-words: uzun durak adi tasmasin. */}
              <p className="mt-1 break-words text-sm text-slate-700">
                {t('driverPortal.fuelStations.nextStop', {
                  stop: data.routeContext.nextStop.label,
                })}
              </p>
              {data.routeContext.calculationStatus === 'calculated' ? (
                <p className="mt-1 text-xs text-slate-600">
                  {t('driverPortal.fuelStations.detourHint')}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Rota motoru calismiyor: liste yine calisiyor, teknik ayrinti yok. */}
          {data.routeContext.calculationStatus === 'routing_unavailable' ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('driverPortal.fuelStations.routingUnavailable')}</span>
            </p>
          ) : null}

          {data.routeContext.mode === 'nearby_only' ? (
            <p className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
              {t(
                data.routeContext.calculationStatus === 'next_stop_location_missing'
                  ? 'driverPortal.fuelStations.nextStopLocationMissing'
                  : 'driverPortal.fuelStations.noActiveTour',
              )}
            </p>
          ) : null}

          {data.unsupportedCompatibleProducts.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t('driverPortal.fuelStations.unsupportedProducts', {
                  products: data.unsupportedCompatibleProducts
                    .map((product) => t(`driverPortal.fuelStations.products.${product}`))
                    .join(', '),
                })}
              </span>
            </p>
          ) : null}

          {/* Yaricap. Degistirmek TEK BASINA sorgu ACMAZ — surucu "Yeniden ara"
              demeden provider cagrisi yapilmiyor. */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('driverPortal.fuelStations.radiusLabel')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {FUEL_STATION_RADIUS_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={option === radiusKm ? 'default' : 'outline'}
                  aria-pressed={option === radiusKm}
                  className={cn('flex-1', TOUCH_TARGET)}
                  onClick={() => setRadiusKm(option)}
                >
                  {t('driverPortal.fuelStations.radiusOption', { km: option })}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className={cn('w-full', TOUCH_TARGET)}
              disabled={busy || !position}
              onClick={() => void handleFind({ radiusKm })}
            >
              {t('driverPortal.fuelStations.searchAgain')}
            </Button>
          </fieldset>

          {products.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('driverPortal.fuelStations.fuelLabel')}
              </legend>
              <div className="flex flex-wrap gap-2">
                {products.map((product) => (
                  <Button
                    key={product}
                    type="button"
                    variant={product === selectedProduct ? 'default' : 'outline'}
                    aria-pressed={product === selectedProduct}
                    className={TOUCH_TARGET}
                    onClick={() =>
                      setSelectedProduct((current) => (current === product ? null : product))
                    }
                  >
                    {t(`driverPortal.fuelStations.products.${product}`)}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('driverPortal.fuelStations.sortLabel')}
            </legend>
            {/* Siralama degistirmek YENI ISTEK ACMAZ: yalnizca ekran
                state'i degisiyor, Tankerkonig/Valhalla cagrilmiyor. */}
            <div className="grid grid-cols-2 gap-2">
              {ROUTE_SORT_MODES.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={mode === sortMode ? 'default' : 'outline'}
                  aria-pressed={mode === sortMode}
                  disabled={!isRouteSortAvailable(mode, { anyRouteMetrics, selectedProduct })}
                  className={cn('w-full', TOUCH_TARGET)}
                  onClick={() => setSortMode(mode)}
                >
                  {t(`driverPortal.fuelStations.sort.${mode}`)}
                </Button>
              ))}
            </div>
            {!selectedProduct && products.length > 1 ? (
              <p className="text-xs text-slate-500">
                {t('driverPortal.fuelStations.sortPriceHint')}
              </p>
            ) : null}
            {!anyRouteMetrics ? (
              <p className="text-xs text-slate-500">
                {t('driverPortal.fuelStations.sortRouteHint')}
              </p>
            ) : null}
          </fieldset>

          {/* Planlanan litre: opsiyonel, BOS baslar ve yalnizca ekran
              state'inde tutulur. Degismesi hicbir istek acmaz. */}
          <div className="space-y-1">
            <label
              htmlFor="planned-litres"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {t('driverPortal.fuelStations.plannedLitresLabel')}
            </label>
            <input
              id="planned-litres"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={plannedLitresInput}
              onChange={(event) => setPlannedLitresInput(event.target.value)}
              aria-invalid={!plannedLitresValid}
              aria-describedby="planned-litres-hint"
              className={cn(
                'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900',
                TOUCH_TARGET,
                plannedLitresValid ? 'border-slate-300' : 'border-red-400',
              )}
            />
            <p id="planned-litres-hint" className="text-xs text-slate-500">
              {plannedLitresValid
                ? t('driverPortal.fuelStations.plannedLitresHint')
                : t('driverPortal.fuelStations.plannedLitresInvalid', {
                    min: MIN_PLANNED_LITRES,
                    max: MAX_PLANNED_LITRES,
                  })}
            </p>
            {/* Guvenilir arac tuketimi yoksa ekonomik TOPLAM sunulmaz. */}
            {!economicAvailable ? (
              <p className="text-xs text-slate-500">
                {t('driverPortal.fuelStations.economicUnavailable')}
              </p>
            ) : null}
          </div>

          {position ? (
            <MapErrorBoundary
              fallback={
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {t('driverPortal.fuelStations.mapUnavailable')}
                </p>
              }
            >
              <DriverFuelStationsMap
                driver={{ latitude: position.latitude, longitude: position.longitude }}
                stations={sorted}
                selectedStationId={selectedStationId}
                onSelectStation={handleSelectStation}
              />
            </MapErrorBoundary>
          ) : null}

          {selectedStation ? (
            <div
              ref={summaryRef}
              tabIndex={-1}
              data-testid="station-summary"
              className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3"
            >
              <p className="text-sm font-semibold text-slate-900">{selectedStation.name}</p>
              <p className="text-xs text-slate-700">
                {formatStationAddress(selectedStation.address) ??
                  t('driverPortal.fuelStations.addressUnknown')}
              </p>
              <Button
                type="button"
                variant="outline"
                className={cn('mt-2 w-full', TOUCH_TARGET)}
                onClick={() => setSelectedStationId(null)}
              >
                {t('driverPortal.fuelStations.closeSummary')}
              </Button>
            </div>
          ) : null}

          {sorted.length === 0 ? (
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <p className="font-medium text-slate-900">
                  {t('driverPortal.fuelStations.emptyTitle')}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {t('driverPortal.fuelStations.emptyBody')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {sorted.map((station) => (
                <li key={station.id}>
                  <StationCard
                    station={station}
                    selected={station.id === selectedStationId}
                    isNearest={station.id === nearestId}
                    isCheapest={station.id === cheapestId}
                    isRecommended={station.id === recommendedId}
                    selectedProduct={selectedProduct}
                    plannedLitres={plannedLitresValid ? plannedLitres : null}
                    consumptionLPer100Km={data.vehicle.avgConsumptionLPer100Km}
                    locale={i18n.language}
                    platform={platform}
                    onSelect={() => handleSelectStation(station.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Live modda kaynak atfi ZORUNLU (CC BY 4.0). Mock modda saglayici
              adi degil "Demodaten" yaziyor — bkz. MockFuelStationProvider. */}
          <p className="pt-1 text-[11px] leading-snug text-slate-500">
            {data.attribution.url ? (
              <a
                href={data.attribution.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {data.attribution.label}
              </a>
            ) : (
              data.attribution.label
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function StationCard({
  station,
  selected,
  isNearest,
  isCheapest,
  isRecommended,
  selectedProduct,
  plannedLitres,
  consumptionLPer100Km,
  locale,
  platform,
  onSelect,
}: {
  station: RouteRecommendationStation;
  selected: boolean;
  isNearest: boolean;
  isCheapest: boolean;
  isRecommended: boolean;
  selectedProduct: FuelProductType | null;
  plannedLitres: number | null;
  consumptionLPer100Km: number | null;
  locale: string;
  platform: ReturnType<typeof detectMobilePlatform>;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  const address = formatStationAddress(station.address);
  const distance = formatDistance(station.distanceKm, locale);
  const retrievedAt = formatRetrievedAt(station.retrievedAt, locale);
  const offerings = visibleOfferings(station, selectedProduct);

  const metrics = station.routeMetrics;
  const routeCalculated = metrics.calculationStatus === 'calculated';
  const roadDistance = formatRoadDistance(metrics.roadDistanceToStationKm, locale);
  const driveTime = formatDriveTime(metrics.driveTimeToStationMin, locale);
  const extraDistance = formatExtraDistance(metrics.extraDistanceKm, locale);
  const extraDuration = formatExtraDuration(metrics.extraDurationMin, locale);
  const stationEta = formatStationEta(metrics.stationEta, locale);

  // Ekonomi: secili yakitin fiyati + surucunun girdigi litre. Litre bos ise
  // hicbir tutar UYDURULMUYOR.
  const selectedPrice = priceFor(station, selectedProduct);
  const purchaseCost = estimatePurchaseCost({
    pricePerLitre: selectedPrice,
    plannedLitres,
  });
  const detourOperatingCost = estimateDetourOperatingCost({
    extraDistanceKm: metrics.extraDistanceKm,
    consumptionLPer100Km,
    pricePerLitre: selectedPrice,
  });
  const choiceCost = estimateStationChoiceCost({ purchaseCost, detourOperatingCost });

  /**
   * Yol tarifi. Mevcut ve guvenli yardimci kullaniliyor
   * (lib/navigation-links.ts) — koordinatla, adres metniyle degil.
   *
   * BU AKSIYON ISTASYONU TURA EKLEMEZ: yalnizca harita uygulamasini acar.
   * TourStop yazimi, rota yeniden optimizasyonu ve ekstra km hesabi bu fazda
   * YOK — bkz. testler.
   */
  const navUrl = buildNavigationUrl(
    { latitude: station.latitude, longitude: station.longitude, label: station.name },
    platform,
  );

  return (
    <Card
      className={cn(
        'border bg-white',
        selected ? 'border-2 border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200',
      )}
    >
      <CardContent className="p-4">
        {/* Karta basmak marker'i secer; harita ve liste secimi tek durumdan gelir. */}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn('w-full text-left', TOUCH_TARGET)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* break-words: uzun istasyon adi ve adres tasmamali. */}
              <p className="break-words font-semibold text-slate-900">{station.name}</p>
              {station.brand ? (
                <p className="break-words text-xs text-slate-500">{station.brand}</p>
              ) : null}
            </div>
            <Fuel className="h-5 w-5 shrink-0 text-[#1a4d7a]" aria-hidden="true" />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {/* Acik/kapali METINLE yaziliyor; renk tek basina anlam tasimiyor. */}
            {station.isOpen === null ? null : (
              <Badge variant={station.isOpen ? 'success' : 'secondary'}>
                {station.isOpen
                  ? t('driverPortal.fuelStations.open')
                  : t('driverPortal.fuelStations.closed')}
              </Badge>
            )}
            {/* "Onerilen" ile "En ucuz"/"En yakin" AYNI SEY DEGIL: onerilen
                secili olcute gore en iyi VE kullanilabilir olandir. */}
            {isRecommended ? (
              <Badge variant="success">{t('driverPortal.fuelStations.recommended')}</Badge>
            ) : null}
            {isNearest ? (
              <Badge variant="outline">{t('driverPortal.fuelStations.nearest')}</Badge>
            ) : null}
            {isCheapest ? (
              <Badge variant="outline">{t('driverPortal.fuelStations.cheapest')}</Badge>
            ) : null}
          </div>

          {address ? (
            <p className="mt-1.5 flex items-start gap-1.5 break-words text-sm text-slate-700">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{address}</span>
            </p>
          ) : null}

          {distance ? (
            <p className="mt-0.5 text-sm text-slate-600">
              {t('driverPortal.fuelStations.distance', { distance })}
            </p>
          ) : null}

          <dl className="mt-2 space-y-1">
            {offerings.map((offering) => {
              const price = formatPricePerLiter(offering.pricePerUnit, locale);
              return (
                <div
                  key={offering.productType}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <dt className="text-slate-600">
                    {t(`driverPortal.fuelStations.products.${offering.productType}`)}
                  </dt>
                  <dd
                    className={cn(
                      'font-semibold',
                      price ? 'text-slate-900' : 'font-normal text-slate-500',
                    )}
                  >
                    {price ?? t('driverPortal.fuelStations.priceUnavailable')}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* Rota metrikleri — yalnizca hesaplandiysa. Hesaplanmadiysa kus
              ucusu mesafe yol mesafesi gibi ETIKETLENMIYOR. */}
          {routeCalculated ? (
            <dl className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
              {roadDistance || driveTime ? (
                <div className="flex items-start gap-1.5 text-slate-700">
                  <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('driverPortal.fuelStations.toStation', {
                      distance: roadDistance ?? '—',
                      duration: driveTime ?? '—',
                    })}
                  </span>
                </div>
              ) : null}
              {extraDistance || extraDuration ? (
                <div className="flex items-start gap-1.5 text-slate-700">
                  <Route className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('driverPortal.fuelStations.routeImpact', {
                      distance: extraDistance ?? '—',
                      duration: extraDuration ?? '—',
                    })}
                  </span>
                </div>
              ) : null}
              {stationEta ? (
                <div className="flex items-start gap-1.5 text-slate-700">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('driverPortal.fuelStations.stationEta', { time: stationEta })}
                  </span>
                </div>
              ) : null}
              {/* Ekstra sure YALNIZCA surus sapmasi; yakit alma/bekleme dahil degil. */}
              <p
                className="pt-0.5 text-xs text-slate-500"
                title={t('driverPortal.fuelStations.refuellingExcluded')}
              >
                {t('driverPortal.fuelStations.refuellingExcluded')}
              </p>
            </dl>
          ) : null}

          {/* Ekonomi: litre girilmeden hicbir tutar gosterilmiyor. */}
          {purchaseCost !== null ? (
            <dl className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-600">
                  {t('driverPortal.fuelStations.estimatedPurchase')}
                </dt>
                <dd className="font-semibold text-slate-900">
                  {formatCurrencyEur(purchaseCost, locale)}
                </dd>
              </div>
              {choiceCost !== null ? (
                <div
                  className="flex items-center justify-between gap-2"
                  title={t('driverPortal.fuelStations.economicFormula')}
                >
                  <dt className="text-slate-600">
                    {t('driverPortal.fuelStations.estimatedChoiceCost')}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {formatCurrencyEur(choiceCost, locale)}
                  </dd>
                </div>
              ) : null}
              {/* Bunun TUR MALIYETI olmadigi acikca yaziliyor. */}
              <p className="pt-0.5 text-xs text-slate-500">
                {t('driverPortal.fuelStations.purchaseEstimateNote')}
              </p>
            </dl>
          ) : null}

          {retrievedAt ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {/* "Fiyat su saatte guncellendi" DEGIL: saglayici fiyat zamani
                  vermiyor, yalnizca bilgiyi ne zaman aldigimizi biliyoruz. */}
              {t('driverPortal.fuelStations.retrievedAt', { time: retrievedAt })}
            </p>
          ) : null}
        </button>

        <Button
          asChild={Boolean(navUrl)}
          disabled={!navUrl}
          variant="outline"
          className={cn('mt-3 w-full', TOUCH_TARGET, !navUrl && 'opacity-50')}
        >
          {navUrl ? (
            <a href={navUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('driverPortal.fuelStations.openRoute')}
            </a>
          ) : (
            <span>{t('driverPortal.fuelStations.noCoordinates')}</span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Sadece test/dogrulama kolayligi icin — fiyat okuma kurali tek yerde. */
export { priceFor };
