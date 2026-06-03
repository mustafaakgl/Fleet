'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LiveTrackingItem } from '@/lib/types';
import {
  STATUS_MARKER_COLORS,
  formatSpeed,
  formatTrackingTimestamp,
  hasMapCoordinates,
  toCoordinate,
} from './tracking-utils';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 6;

interface LiveTrackingMapProps {
  items: LiveTrackingItem[];
  selectedDriverId: string | null;
  onSelect: (item: LiveTrackingItem) => void;
  fitBoundsRequestId: number;
}

function FitBounds({
  items,
  fitBoundsRequestId,
}: {
  items: LiveTrackingItem[];
  fitBoundsRequestId: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    if (items.length === 1) {
      map.setView([items[0].latitude!, items[0].longitude!], 13);
      return;
    }

    const bounds = L.latLngBounds(items.map((item) => [item.latitude!, item.longitude!]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [fitBoundsRequestId, items, map]);

  return null;
}

function MapFocusHandler({
  item,
}: {
  item: LiveTrackingItem | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!item || !hasMapCoordinates(item)) {
      return;
    }

    const lat = toCoordinate(item.latitude);
    const lng = toCoordinate(item.longitude);
    if (lat === null || lng === null) {
      return;
    }

    map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
  }, [item, map]);

  return null;
}

function VehicleMarker({
  item,
  selected,
  onSelect,
}: {
  item: LiveTrackingItem;
  selected: boolean;
  onSelect: (item: LiveTrackingItem) => void;
}) {
  const markerRef = useRef<L.CircleMarker>(null);
  const lat = toCoordinate(item.latitude);
  const lng = toCoordinate(item.longitude);

  useEffect(() => {
    if (selected) {
      markerRef.current?.openPopup();
    }
  }, [selected]);

  if (lat === null || lng === null) {
    return null;
  }

  return (
    <CircleMarker
      ref={markerRef}
      center={[lat, lng]}
      radius={selected ? 11 : 8}
      pathOptions={{
        color: '#ffffff',
        weight: selected ? 3 : 2,
        fillColor: STATUS_MARKER_COLORS[item.status],
        fillOpacity: 0.95,
      }}
      eventHandlers={{
        click: () => onSelect(item),
      }}
    >
      <Popup>
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-slate-900">{item.plateNumber ?? 'No vehicle'}</p>
          <p className="text-slate-700">{item.driverName}</p>
          <p className="text-slate-600">{item.companyName ?? '—'}</p>
          <p className="text-slate-600">{item.cargoName ?? '—'}</p>
          <p className="text-slate-600">{formatSpeed(item.speedKmh)}</p>
          <p className="text-slate-500">{formatTrackingTimestamp(item.receivedAt)}</p>
          <p className="capitalize text-slate-500">{item.status}</p>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function LiveTrackingMapCanvas({
  items,
  selectedDriverId,
  onSelect,
  fitBoundsRequestId,
}: LiveTrackingMapProps) {
  const mapItems = useMemo(
    () =>
      items.filter((item) => hasMapCoordinates(item)).map((item) => ({
        ...item,
        latitude: toCoordinate(item.latitude)!,
        longitude: toCoordinate(item.longitude)!,
      })),
    [items],
  );

  const selectedItem = mapItems.find((item) => item.driverId === selectedDriverId) ?? null;

  return (
    <div className="h-full min-h-[520px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds items={mapItems} fitBoundsRequestId={fitBoundsRequestId} />
        <MapFocusHandler item={selectedItem} />
        {mapItems.map((item) => (
          <VehicleMarker
            key={item.driverId}
            item={item}
            selected={selectedDriverId === item.driverId}
            onSelect={onSelect}
          />
        ))}
      </MapContainer>
    </div>
  );
}

export function LiveTrackingMap(props: LiveTrackingMapProps) {
  const [mounted, setMounted] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    setMounted(true);
    setMapKey((current) => current + 1);

    return () => {
      setMounted(false);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading map...
      </div>
    );
  }

  return <LiveTrackingMapCanvas key={mapKey} {...props} />;
}
