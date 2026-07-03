'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet.markercluster';
import type { LiveTrackingItem, LiveTrackingTrailPoint } from '@/lib/types';
import { ThemedTileLayer, MapThemeSync } from '@/components/map/ThemedTileLayer';
import { createVehicleDirectionIcon } from '@/components/map/vehicle-direction-icon';
import { buildSpeedColoredSegments } from '@/lib/map-speed-segments';
import { LocationSourceBadge } from './LocationSourceBadge';
import {
  formatSpeed,
  formatTrackingTimestamp,
  hasMapCoordinates,
  isAlarmItem,
  markerFillColor,
  toCoordinate,
} from './tracking-utils';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const DEFAULT_CENTER: L.LatLngExpression = [51.1657, 10.4515];
const DEFAULT_ZOOM = 6;

interface LiveTrackingMapProps {
  items: LiveTrackingItem[];
  trailPoints: LiveTrackingTrailPoint[];
  selectedDriverId: string | null;
  onSelect: (item: LiveTrackingItem) => void;
  followMode: boolean;
  onFollowModeChange: (value: boolean) => void;
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
    if (items.length === 0) return;
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
  selectedDriverId,
  followMode,
  onFollowModeChange,
}: {
  item: LiveTrackingItem | null;
  selectedDriverId: string | null;
  followMode: boolean;
  onFollowModeChange: (value: boolean) => void;
}) {
  const map = useMap();
  const previousSelectedId = useRef<string | null>(null);

  useMapEvents({
    dragstart: () => {
      if (followMode) {
        onFollowModeChange(false);
      }
    },
  });

  useEffect(() => {
    if (!item || !hasMapCoordinates(item)) return;
    const lat = toCoordinate(item.latitude);
    const lng = toCoordinate(item.longitude);
    if (lat === null || lng === null) return;

    if (followMode) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
      return;
    }

    if (previousSelectedId.current !== selectedDriverId) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
    }
  }, [followMode, item, map, selectedDriverId]);

  useEffect(() => {
    previousSelectedId.current = selectedDriverId;
  }, [selectedDriverId]);

  return null;
}

function clusterClass(items: LiveTrackingItem[]): string {
  if (items.some((item) => isAlarmItem(item))) return 'live-cluster-critical';
  if (items.some((item) => item.motionState === 'idle')) return 'live-cluster-idle';
  return 'live-cluster-normal';
}

function ClusteredMarkers({
  items,
  onSelect,
}: {
  items: LiveTrackingItem[];
  onSelect: (item: LiveTrackingItem) => void;
}) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const itemByMarkerStampRef = useRef<Map<number, LiveTrackingItem>>(new Map());

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const children = cluster.getAllChildMarkers();
        const childItems = children
          .map((marker) => itemByMarkerStampRef.current.get(L.Util.stamp(marker)))
          .filter((item): item is LiveTrackingItem => Boolean(item));
        const className = clusterClass(childItems);
        return L.divIcon({
          html: `<span>${cluster.getChildCount()}</span>`,
          className: `marker-cluster ${className}`,
          iconSize: [38, 38],
        });
      },
    });

    clusterGroupRef.current = clusterGroup;
    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
      clusterGroupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const clusterGroup = clusterGroupRef.current;
    if (!clusterGroup) return;

    clusterGroup.clearLayers();

    const markers: L.Marker[] = [];
    itemByMarkerStampRef.current.clear();
    for (const item of items) {
      const lat = toCoordinate(item.latitude);
      const lng = toCoordinate(item.longitude);
      if (lat === null || lng === null) continue;

      const marker = L.marker([lat, lng], {
        icon: createVehicleDirectionIcon({
          headingDeg: item.headingDeg,
          selected: false,
          offline: item.motionState === 'offline',
          fillColor: markerFillColor(item),
          hasAlarm: isAlarmItem(item),
        }),
      });
      itemByMarkerStampRef.current.set(L.Util.stamp(marker), item);
      marker.on('click', () => onSelect(item));
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.35;">
          <strong>${item.plateNumber ?? 'No vehicle'}</strong><br/>
          <span>${item.driverName}</span><br/>
          <span>${formatSpeed(item.speedKmh)}</span>
        </div>`,
      );
      markers.push(marker);
    }

    clusterGroup.addLayers(markers);
  }, [items, onSelect]);

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
  const markerRef = useRef<L.Marker>(null);
  const lat = toCoordinate(item.latitude);
  const lng = toCoordinate(item.longitude);

  const icon = useMemo(
    () =>
      createVehicleDirectionIcon({
        headingDeg: item.headingDeg,
        selected,
        offline: item.motionState === 'offline',
        fillColor: markerFillColor(item),
        hasAlarm: isAlarmItem(item),
      }),
    [item, selected],
  );

  useEffect(() => {
    if (selected) markerRef.current?.openPopup();
  }, [selected]);

  if (lat === null || lng === null) return null;

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(item) }}
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
          <LocationSourceBadge source={item.locationSource} />
        </div>
      </Popup>
    </Marker>
  );
}

function LiveTrackingMapCanvas({
  items,
  trailPoints,
  selectedDriverId,
  onSelect,
  followMode,
  onFollowModeChange,
  fitBoundsRequestId,
}: LiveTrackingMapProps) {
  const mapItems = useMemo(
    () =>
      items
        .filter((item) => hasMapCoordinates(item))
        .map((item) => ({
          ...item,
          latitude: toCoordinate(item.latitude)!,
          longitude: toCoordinate(item.longitude)!,
        })),
    [items],
  );

  const selectedItem = mapItems.find((item) => item.driverId === selectedDriverId) ?? null;
  const nonSelectedItems = mapItems.filter((item) => item.driverId !== selectedDriverId);
  const clusterEnabled = nonSelectedItems.length >= 25;
  const trailSegments = useMemo(
    () =>
      buildSpeedColoredSegments(
        trailPoints.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          speedKmh: point.speedKph,
        })),
      ),
    [trailPoints],
  );

  return (
    <div className="h-full min-h-[520px] overflow-hidden rounded-lg border border-slate-200" data-testid="live-tracking-map">
      <style>{`
        .live-cluster-normal { background: rgba(22, 163, 74, 0.9); color: #fff; border-radius: 9999px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; }
        .live-cluster-idle { background: rgba(217, 119, 6, 0.92); color: #fff; border-radius: 9999px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; }
        .live-cluster-critical { background: rgba(220, 38, 38, 0.92); color: #fff; border-radius: 9999px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; }
      `}</style>
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom>
        <ThemedTileLayer />
        <MapThemeSync />
        <FitBounds items={mapItems} fitBoundsRequestId={fitBoundsRequestId} />
        <MapFocusHandler
          item={selectedItem}
          selectedDriverId={selectedDriverId}
          followMode={followMode}
          onFollowModeChange={onFollowModeChange}
        />
        {clusterEnabled ? <ClusteredMarkers items={nonSelectedItems} onSelect={onSelect} /> : null}
        {(clusterEnabled ? (selectedItem ? [selectedItem] : []) : mapItems).map((item) => (
          <VehicleMarker key={item.driverId} item={item} selected={selectedDriverId === item.driverId} onSelect={onSelect} />
        ))}
        {trailSegments.map((segment, index) => (
          <Polyline
            key={`trail-segment-${index}`}
            positions={segment.positions}
            pathOptions={{ color: segment.color, weight: 5, opacity: 0.85, className: 'live-trail-segment' }}
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
    return () => setMounted(false);
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
