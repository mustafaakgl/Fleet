'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { ThemedTileLayer } from '@/components/map/ThemedTileLayer';
import { decodePolyline } from '@/lib/decode-polyline';
import type { TourStop } from '@/lib/api';
import 'leaflet/dist/leaflet.css';

/** Almanya merkezi — hicbir durak koordinat tasimazken gosterilen gorunum */
const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 5;

function hasCoordinates(
  stop: TourStop,
): stop is TourStop & { latitude: number; longitude: number } {
  return stop.latitude !== null && stop.longitude !== null;
}

/**
 * Numarali durak isareti.
 *
 * Leaflet'in varsayilan pin'i yerine divIcon: dispatcher haritada sirayi
 * okuyabilmeli, aksi halde on durak birbirinin ayni gorunur. Ulasilamaz
 * durak kirmizi — uyari metnini okumadan da farkedilsin.
 */
function numberedIcon(sequence: number, unreachable: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${
      unreachable ? '#e11d48' : '#1e3a5f'
    };color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${sequence}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Yakit duragi isareti — POMPA, numara DEGIL.
 *
 * Bilincli olarak numarasiz: yakit duragi bir TourStop degildir ve durak
 * numaralandirmasina girmesi, dispatcher'a "tura bir durak eklendi" izlenimi
 * verirdi. Bicim de ayri (yesil, pompa simgesi) — renk tek basina anlam
 * tasimasin diye tooltip'te ayrica yaziyor.
 */
function fuelStopIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      '<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;' +
      'border-radius:9999px;background:#047857;color:#fff;border:2px solid #fff;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.4)">' +
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/>' +
      '<path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/>' +
      '<path d="M18 22V11a2 2 0 0 0-.6-1.4L15 7"/></svg>' +
      '</span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
  }, [map, points]);

  return null;
}

/**
 * Hesaplanmis turun haritasi: bacak bacak rota cizgisi ve numarali duraklar.
 *
 * Cizgi bacak govdelerinden kuruluyor, duraklari duz cizgiyle baglamaktan
 * degil: duz cizgi 40 km'lik bir sapmayi gizler ve dispatcher rotanin
 * nereden gectigini goremez. Govde yoksa (optimizasyon calismamis) yalnizca
 * isaretler gosterilir — sahte bir rota cizmektense hicbir sey cizmemek
 * dogrudur.
 */
export function TourRoutePreviewMap({
  stops,
  fuelStop = null,
}: {
  stops: TourStop[];
  /**
   * Planlanan yakit duragi — AYRI bir overlay isaret.
   *
   * Rota cizgisine DAHIL EDILMIYOR: elimizde istasyona giden gercek bir yol
   * govdesi yok ve duraklarla arasina duz cizgi cekmek, olmayan bir rotayi
   * varmis gibi gostermek olurdu. Govde yoksa yalnizca isaret cizilir.
   */
  fuelStop?: { latitude: number; longitude: number; name: string } | null;
}) {
  const { t } = useTranslation();

  const positioned = useMemo(() => stops.filter(hasCoordinates), [stops]);

  const markers = useMemo(
    () => positioned.map((stop) => ({ stop, point: [stop.latitude, stop.longitude] as [number, number] })),
    [positioned],
  );

  const legLines = useMemo(
    () =>
      stops
        .filter((stop) => Boolean(stop.legShape))
        .map((stop) => ({ id: stop.id, points: decodePolyline(stop.legShape as string) }))
        .filter((leg) => leg.points.length > 1),
    [stops],
  );

  const fitPoints = useMemo(() => {
    const fromLegs = legLines.flatMap((leg) => leg.points);
    return fromLegs.length > 0 ? fromLegs : markers.map((marker) => marker.point);
  }, [legLines, markers]);

  if (markers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
        {t('tourBuilder.mapEmpty')}
      </p>
    );
  }

  return (
    <div className="h-72 overflow-hidden rounded-md border border-slate-200">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <ThemedTileLayer />
        <FitBounds points={fitPoints} />

        {legLines.map((leg) => (
          <Polyline key={leg.id} positions={leg.points} pathOptions={{ color: '#1e3a5f', weight: 4 }} />
        ))}

        {markers.map(({ stop, point }) => (
          <Marker
            key={stop.id}
            position={point}
            icon={numberedIcon(stop.sequence, stop.truckAccess === 'unreachable')}
          >
            <Tooltip>
              <span className="text-xs">
                {stop.sequence}. {stop.address}
              </span>
            </Tooltip>
          </Marker>
        ))}

        {/* Yakit duragi EN SONDA ve numarasiz: durak sirasina girmiyor. */}
        {fuelStop &&
        Number.isFinite(fuelStop.latitude) &&
        Number.isFinite(fuelStop.longitude) ? (
          <Marker
            position={[fuelStop.latitude, fuelStop.longitude]}
            icon={fuelStopIcon()}
            data-testid="tour-map-fuel-stop"
          >
            <Tooltip>
              <span className="text-xs">
                {t('tours.fuelingIntent.mapMarker', { station: fuelStop.name })}
              </span>
            </Tooltip>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
