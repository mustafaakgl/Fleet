'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import type { FleetDrivingEvent, FleetTripLocationPoint } from '@/lib/types';
import { formatFleetDateTime } from '@/lib/locale-format';
import { formatFleetTripSpeed } from '@/lib/fleet-trip-format';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 6;

const EVENT_COLORS: Record<FleetDrivingEvent['type'], string> = {
  speeding: '#dc2626',
  harsh_accel: '#ea580c',
  harsh_brake: '#ca8a04',
  harsh_corner: '#7c3aed',
  crash: '#b91c1c',
};

interface FleetTripRouteMapProps {
  locationPoints: FleetTripLocationPoint[];
  drivingEvents: FleetDrivingEvent[];
}

function FitRouteBounds({ coordinates }: { coordinates: L.LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.setView(coordinates[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(coordinates), { padding: [48, 48], maxZoom: 15 });
  }, [coordinates, map]);

  return null;
}

function FleetTripRouteMapCanvas({ locationPoints, drivingEvents }: FleetTripRouteMapProps) {
  const { t } = useTranslation();

  const coordinates = useMemo(
    () => locationPoints.map((point) => [point.lat, point.lng] as L.LatLngExpression),
    [locationPoints],
  );

  const startPoint = locationPoints[0] ?? null;
  const endPoint = locationPoints.length > 1 ? locationPoints[locationPoints.length - 1] : null;

  const eventLabel = (type: FleetDrivingEvent['type']) => {
    switch (type) {
      case 'speeding':
        return t('fleetTrips.eventSpeeding', 'Hız ihlali');
      case 'harsh_accel':
        return t('fleetTrips.eventHarshAccel', 'Sert hızlanma');
      case 'harsh_brake':
        return t('fleetTrips.eventHarshBrake', 'Sert fren');
      case 'harsh_corner':
        return t('fleetTrips.eventHarshCorner', 'Sert viraj');
      case 'crash':
        return t('fleetTrips.eventCrash', 'Kaza');
      default:
        return type;
    }
  };

  if (coordinates.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        {t('fleetTrips.detail.noRoute', 'Bu sefer için GPS rotası yok.')}
      </div>
    );
  }

  return (
    <div className="h-full min-h-[420px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRouteBounds coordinates={coordinates} />
        <Polyline positions={coordinates} pathOptions={{ color: '#1a4d7a', weight: 5, opacity: 0.85 }} />
        {startPoint ? (
          <CircleMarker
            center={[startPoint.lat, startPoint.lng]}
            radius={8}
            pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <p className="text-xs font-semibold text-slate-900">
                {t('fleetTrips.detail.routeStart', 'Başlangıç')}
              </p>
              <p className="text-xs text-slate-600">{formatFleetDateTime(startPoint.recordedAt)}</p>
            </Popup>
          </CircleMarker>
        ) : null}
        {endPoint && endPoint.id !== startPoint?.id ? (
          <CircleMarker
            center={[endPoint.lat, endPoint.lng]}
            radius={8}
            pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <p className="text-xs font-semibold text-slate-900">
                {t('fleetTrips.detail.routeEnd', 'Bitiş')}
              </p>
              <p className="text-xs text-slate-600">{formatFleetDateTime(endPoint.recordedAt)}</p>
            </Popup>
          </CircleMarker>
        ) : null}
        {drivingEvents.map((event) => (
          <CircleMarker
            key={event.id}
            center={[event.lat, event.lng]}
            radius={7}
            pathOptions={{
              color: EVENT_COLORS[event.type],
              fillColor: EVENT_COLORS[event.type],
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup>
              <p className="text-xs font-semibold text-slate-900">{eventLabel(event.type)}</p>
              <p className="text-xs text-slate-600">{formatFleetDateTime(event.occurredAt)}</p>
              <p className="text-xs text-slate-600">
                {formatFleetTripSpeed(event.value)} / {formatFleetTripSpeed(event.threshold)}
              </p>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export function FleetTripRouteMap(props: FleetTripRouteMapProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        {t('common.loading', 'Laden…')}
      </div>
    );
  }

  return <FleetTripRouteMapCanvas {...props} />;
}
