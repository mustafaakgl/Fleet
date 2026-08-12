'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import type { NearbyFuelStation } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

interface DriverFuelStationsMapProps {
  driver: { latitude: number; longitude: number };
  stations: readonly NearbyFuelStation[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
}

/**
 * Sonuclari cerceveye alir.
 *
 * Secili istasyona ODAKLANIR ama zoom'u kullanicinin elinden almaz: secim
 * degistiginde haritayi o noktaya kaydiriyoruz, her seferinde tum sonuclara
 * geri zoomlamak surucunun elle yaptigi yakinlastirmayi bozardi.
 */
function FitStations({
  driver,
  stations,
  selectedStationId,
}: {
  driver: { latitude: number; longitude: number };
  stations: readonly NearbyFuelStation[];
  selectedStationId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selected = selectedStationId
      ? stations.find((station) => station.id === selectedStationId)
      : null;

    if (selected) {
      map.panTo([selected.latitude, selected.longitude], { animate: true });
      return;
    }

    const points: L.LatLngExpression[] = [
      [driver.latitude, driver.longitude],
      ...stations.map(
        (station) => [station.latitude, station.longitude] as L.LatLngExpression,
      ),
    ];
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 14 });
  }, [driver.latitude, driver.longitude, map, selectedStationId, stations]);

  return null;
}

function DriverFuelStationsMapCanvas({
  driver,
  stations,
  selectedStationId,
  onSelectStation,
}: DriverFuelStationsMapProps) {
  const { t } = useTranslation();

  const center = useMemo<L.LatLngExpression>(
    () => [driver.latitude, driver.longitude],
    [driver.latitude, driver.longitude],
  );

  return (
    <div className="h-64 overflow-hidden rounded-lg border border-slate-200 sm:h-80">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Harita hareketinde OTOMATIK ISTEK YOK: burada hicbir moveend/zoomend
            dinleyicisi bilincli olarak yok — kota tuketen sessiz cagrilar
            olusmasin. "Bu alanda yeniden ara" sonraki fazin isi. */}
        <FitStations driver={driver} stations={stations} selectedStationId={selectedStationId} />

        {/* Surucunun konumu: istasyonlardan AYRI bir bicim ve kendi erisilebilir adi. */}
        <CircleMarker
          center={center}
          radius={9}
          pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 3 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {t('driverPortal.fuelStations.currentLocation')}
          </Tooltip>
        </CircleMarker>

        {stations.map((station) => {
          const selected = station.id === selectedStationId;
          return (
            <CircleMarker
              key={station.id}
              center={[station.latitude, station.longitude]}
              // Secili marker YALNIZCA renkle degil, boyut ve kalin cerceveyle
              // de ayirt ediliyor.
              radius={selected ? 13 : 8}
              pathOptions={{
                color: selected ? '#065f46' : '#15803d',
                fillColor: selected ? '#10b981' : '#4ade80',
                fillOpacity: 0.95,
                weight: selected ? 4 : 2,
              }}
              eventHandlers={{ click: () => onSelectStation(station.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {station.name}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

/**
 * Istasyon haritasi.
 *
 * Mevcut harita katmani kullaniliyor (Leaflet + react-leaflet, bkz.
 * DriverAssignmentRouteMap) — ikinci bir harita kutuphanesi eklenmedi.
 *
 * `mounted` bekcisi: Leaflet DOM'a ihtiyac duyar ve sunucuda render edilemez.
 * Harita yuklenemezse LISTE calismaya devam eder — cagiran taraf haritayi
 * hata sinirina sariyor (bkz. DriverFuelStationsScreen).
 */
export function DriverFuelStationsMap(props: DriverFuelStationsMapProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return (
      <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-slate-100 sm:h-80" />
    );
  }

  if (!Number.isFinite(props.driver.latitude) || !Number.isFinite(props.driver.longitude)) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('driverPortal.fuelStations.mapUnavailable')}
      </div>
    );
  }

  return <DriverFuelStationsMapCanvas {...props} />;
}
