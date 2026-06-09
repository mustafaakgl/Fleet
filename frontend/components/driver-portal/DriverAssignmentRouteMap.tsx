'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchDrivingRoute,
  formatRouteDistance,
  formatRouteDuration,
  type DrivingRouteResult,
} from '@/lib/route-geocoding';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 6;

interface DriverAssignmentRouteMapProps {
  pickupAddress: string;
  deliveryAddress: string;
}

function FitRouteBounds({ route }: { route: DrivingRouteResult | null }) {
  const map = useMap();

  useEffect(() => {
    if (!route) return;
    const bounds = L.latLngBounds(route.coordinates);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [map, route]);

  return null;
}

function DriverAssignmentRouteMapCanvas({
  pickupAddress,
  deliveryAddress,
}: DriverAssignmentRouteMapProps) {
  const { t, i18n } = useTranslation();
  const [route, setRoute] = useState<DrivingRouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchDrivingRoute(pickupAddress, deliveryAddress)
      .then((result) => {
        if (!active) return;
        setRoute(result);
        if (!result) {
          setError(t('driverPortal.assignments.routeMapUnavailable'));
        }
      })
      .catch(() => {
        if (!active) return;
        setRoute(null);
        setError(t('driverPortal.assignments.routeMapUnavailable'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [deliveryAddress, pickupAddress, t]);

  const summary = useMemo(() => {
    if (!route) return null;
    return {
      distance: formatRouteDistance(route.distanceMeters, i18n.language),
      duration: formatRouteDuration(route.durationSeconds),
    };
  }, [i18n.language, route]);

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('driverPortal.assignments.routeMapLoading')}
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {error ?? t('driverPortal.assignments.routeMapUnavailable')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summary ? (
        <p className="text-xs text-slate-600">
          {t('driverPortal.assignments.routeSummary', {
            distance: summary.distance,
            duration: summary.duration,
          })}
        </p>
      ) : null}
      <div className="h-56 overflow-hidden rounded-lg border border-slate-200 sm:h-72">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRouteBounds route={route} />
          <Polyline positions={route.coordinates} pathOptions={{ color: '#1a4d7a', weight: 5, opacity: 0.85 }} />
          <CircleMarker
            center={[route.pickup.lat, route.pickup.lng]}
            radius={8}
            pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <p className="text-xs font-semibold text-slate-900">{t('driverPortal.assignments.pickup')}</p>
              <p className="text-xs text-slate-600">{pickupAddress}</p>
            </Popup>
          </CircleMarker>
          <CircleMarker
            center={[route.delivery.lat, route.delivery.lng]}
            radius={8}
            pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <p className="text-xs font-semibold text-slate-900">{t('driverPortal.assignments.delivery')}</p>
              <p className="text-xs text-slate-600">{deliveryAddress}</p>
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>
    </div>
  );
}

export function DriverAssignmentRouteMap(props: DriverAssignmentRouteMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        …
      </div>
    );
  }

  return <DriverAssignmentRouteMapCanvas {...props} />;
}
