'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { ThemedTileLayer } from '@/components/map/ThemedTileLayer';
import { decodePolyline } from '@/lib/decode-polyline';
import { routingApi, type PickedLocation, type RoutePreview } from '@/lib/api';
import 'leaflet/dist/leaflet.css';

interface AssignmentRoutePreviewMapProps {
  pickup: PickedLocation | null;
  delivery: PickedLocation | null;
}

/** Almanya merkezi — hicbir uc secilmemisken gosterilen varsayilan gorunum */
const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 5;

function hasCoordinates(
  location: PickedLocation | null,
): location is PickedLocation & { latitude: number; longitude: number } {
  return location !== null && location.latitude !== null && location.longitude !== null;
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

function RoutePreviewCanvas({ pickup, delivery }: AssignmentRoutePreviewMapProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [loading, setLoading] = useState(false);

  // useMemo: her render'da yeni dizi uretmek asagidaki fitPoints memo'sunu
  // gecersiz kilar ve harita surekli yeniden konumlanir.
  const pickupPoint = useMemo<[number, number] | null>(
    () => (hasCoordinates(pickup) ? [pickup.latitude, pickup.longitude] : null),
    [pickup],
  );
  const deliveryPoint = useMemo<[number, number] | null>(
    () => (hasCoordinates(delivery) ? [delivery.latitude, delivery.longitude] : null),
    [delivery],
  );

  useEffect(() => {
    if (!pickup?.id || !delivery?.id) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    routingApi
      .routePreview(pickup.id, delivery.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        // Rota alinamadi — harita isaretcilerle calismaya devam eder
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [delivery?.id, pickup?.id]);

  const routeLine = useMemo(
    () => (preview?.available && preview.shape ? decodePolyline(preview.shape, 6) : []),
    [preview],
  );

  const fitPoints = useMemo(() => {
    if (routeLine.length > 0) return routeLine;
    return [pickupPoint, deliveryPoint].filter(Boolean) as Array<[number, number]>;
  }, [deliveryPoint, pickupPoint, routeLine]);

  return (
    <div className="space-y-2">
      <div className="h-64 overflow-hidden rounded-lg border">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <ThemedTileLayer />
          <FitBounds points={fitPoints} />

          {routeLine.length > 0 ? (
            <Polyline positions={routeLine} pathOptions={{ color: '#2563eb', weight: 4 }} />
          ) : null}

          {pickupPoint ? (
            <CircleMarker
              center={pickupPoint}
              radius={8}
              pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.9 }}
            >
              <Tooltip>{t('assignmentForm.pickup')}</Tooltip>
            </CircleMarker>
          ) : null}

          {deliveryPoint ? (
            <CircleMarker
              center={deliveryPoint}
              radius={8}
              pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9 }}
            >
              <Tooltip>{t('assignmentForm.delivery')}</Tooltip>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t('address.routeLoading')}</p>
      ) : preview?.available ? (
        <p className="text-xs text-muted-foreground">
          {t('address.routeSummary', {
            km: preview.distanceKm?.toFixed(1),
            minutes: Math.round(preview.durationMinutes ?? 0),
          })}
          {preview.hasToll ? ` · ${t('address.routeHasToll')}` : ''}
        </p>
      ) : pickupPoint && deliveryPoint ? (
        <p className="text-xs text-amber-600">{t('address.routeUnavailable')}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('address.routeHint')}</p>
      )}
    </div>
  );
}

/**
 * Gorev formundaki rota onizlemesi.
 *
 * Leaflet SSR'da calismadigi icin repo'daki mevcut desen izleniyor: bilesen
 * yalnizca istemcide baglandiktan sonra render ediliyor.
 */
export function AssignmentRoutePreviewMap(props: AssignmentRoutePreviewMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return <div className="h-64 rounded-lg border bg-muted/30" />;
  }

  return <RoutePreviewCanvas {...props} />;
}
