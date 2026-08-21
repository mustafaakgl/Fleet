'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { ThemedTileLayer } from '@/components/map/ThemedTileLayer';
import type { DispatchPlannedStopView } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

/** Almanya merkezi — hicbir durak koordinat tasimazken gosterilen gorunum. */
const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 5;

function hasCoordinates(
  stop: DispatchPlannedStopView,
): stop is DispatchPlannedStopView & { latitude: number; longitude: number } {
  return stop.latitude !== null && stop.longitude !== null;
}

/**
 * Numarali durak isareti.
 *
 * Leaflet varsayilan pin'i yerine `divIcon`: dispatcher haritada SIRAYI
 * okuyabilmeli, aksi halde on durak birbirinin ayni gorunur. Yukleme ve
 * teslimat farkli renkte VE tooltip'te ayrica yaziyor — renk tek basina
 * anlam tasimamali.
 */
function stopIcon(sequence: number, kind: string): L.DivIcon {
  const background = kind === 'pickup' ? '#1e3a5f' : '#047857';
  return L.divIcon({
    className: '',
    html:
      `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;` +
      `border-radius:9999px;background:${background};color:#fff;font-size:11px;font-weight:700;` +
      `border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${sequence}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 12 });
  }, [map, points]);

  return null;
}

/**
 * Planlanan durak sirasinin haritasi (Faz 17g).
 *
 * ROTA GOVDESI CIZILMIYOR ve bu bilincli: dispatch onerisi bir durak SIRASI
 * ve ETA tasiyor, bacak govdesi (polyline) TASIMIYOR. Duraklari duz cizgiyle
 * baglasaydik 40 km'lik bir sapmayi gizler ve dispatcher rotanin nereden
 * gectigini bildigini SANIRDI. Uygulanmis turun gercek rotasi tur ekranindan
 * gorulur; burada gosterilen sey siradir.
 *
 * KOORDINATSIZ DURAK CIZILMEZ: geokodlanmamis bir konum icin 0,0'a isaret
 * koymak, Gine Korfezi'nde bir teslimat gostermek olurdu. Kac duragin
 * cizilemedigi ayrica YAZIYOR — sessizce eksiltmek "butun duraklar burada"
 * izlenimi verirdi.
 */
export function DispatchRouteMap({ stops }: { stops: readonly DispatchPlannedStopView[] }) {
  const { t } = useTranslation();

  const positioned = useMemo(() => stops.filter(hasCoordinates), [stops]);
  const points = useMemo(
    () => positioned.map((stop) => [stop.latitude, stop.longitude] as [number, number]),
    [positioned],
  );
  const missing = stops.length - positioned.length;

  return (
    <div className="space-y-2">
      <div
        className="h-64 w-full overflow-hidden rounded-lg border border-slate-200 sm:h-80"
        data-testid="dispatch-route-map"
      >
        <MapContainer
          center={points[0] ?? DEFAULT_CENTER}
          zoom={points.length > 0 ? 10 : DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          // Klavye ile de gezilebilir olmali.
          keyboard
        >
          <ThemedTileLayer />
          <FitBounds points={points} />
          {positioned.map((stop) => (
            <Marker
              key={`${stop.sequence}-${stop.locationId ?? 'x'}`}
              position={[stop.latitude, stop.longitude]}
              icon={stopIcon(stop.sequence, stop.kind)}
            >
              <Tooltip>
                <span className="text-xs">
                  {`${stop.sequence}. ${t(`dispatch.stopKind.${stop.kind}`, {
                    defaultValue: stop.kind,
                  })}`}
                  {stop.locationLabel ? ` · ${stop.locationLabel}` : ''}
                </span>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {missing > 0 ? (
        <p role="status" className="text-xs text-amber-800">
          {t('dispatch.map.missingCoordinates', { count: missing })}
        </p>
      ) : null}
      {stops.length === 0 ? (
        <p role="status" className="text-xs text-slate-600">
          {t('dispatch.map.noStops')}
        </p>
      ) : null}
    </div>
  );
}
