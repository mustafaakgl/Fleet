'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Bus,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Ellipsis,
  Eye,
  Fuel,
  Layers,
  MapPinned,
  Minus,
  Pencil,
  Plus,
  Radar,
  Route,
  Search,
  Settings2,
  ShieldAlert,
  Truck,
  User,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

type MonitorTab = 'overview' | 'pois' | 'history' | 'fuel' | 'sharing';

interface VehicleItem {
  plate: string;
  archived?: boolean;
}

interface TripSummary {
  vin: string;
  routeSummary: string;
  startTime: string;
  startAddress: string;
  endTime: string;
  endAddress: string;
  lastUpdate: string;
  foundEvents: number;
}

interface EventItem {
  eventDetails: string;
  subtext?: string;
  timestamp: string;
  driver: string;
  odometer: string;
  speed: string;
  fuel: string;
  chargeStatus: string;
  position: string;
  distance: string;
  duration: string;
}

interface FuelEntryRow {
  id: string;
  vehicle: string;
  date: string;
  vendor: string;
  meterEntry: string;
  usage: string;
  volume: string;
  total: string;
  fuelEconomy: string;
  costPerMeter: string;
  alerts: string;
}

interface RoutePoint {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'start' | 'stop' | 'end';
}

interface DriverRecord {
  id: string;
  name: string;
  vehicle: string;
  location: string;
  lastEvent: string;
  fuelLevel: string;
  speed: string;
  routeDuration: string;
  routeDistance: string;
  status: 'Completed' | 'In Progress';
  lastUpdate: string;
  route?: RoutePoint[];
}

const monitorTabs: Array<{ id: MonitorTab; label: string; icon: typeof Truck }> = [
  { id: 'overview', label: 'Übersicht', icon: Radar },
  { id: 'pois', label: 'POIs & Geofences', icon: MapPinned },
  { id: 'history', label: 'Fahrhistorie', icon: Route },
  { id: 'fuel', label: 'Fuel History', icon: Fuel },
  { id: 'sharing', label: 'Positionsfreigabe', icon: Truck },
];

const drivers: DriverRecord[] = [
  { id: 'd-1', name: 'Mustafa Ahmedov', vehicle: 'B-SG 1540', location: 'Berlin Depot', lastEvent: 'Angehalten', fuelLevel: '74%', speed: '0 km/h', routeDuration: '1 h 42 min', routeDistance: '18.2 km', status: 'Completed', lastUpdate: 'Heute, 12:21' },
  { id: 'd-2', name: 'Awal Amadu', vehicle: 'B-SG 1541', location: 'Leipzig Ring', lastEvent: 'Angefahren', fuelLevel: '68%', speed: '22 km/h', routeDuration: '2 h 01 min', routeDistance: '24.9 km', status: 'In Progress', lastUpdate: 'Heute, 13:10' },
  { id: 'd-3', name: 'Saidou Baldeh', vehicle: 'B-SG 1542', location: 'Hamburg Zentrum', lastEvent: 'Angehalten', fuelLevel: '82%', speed: '0 km/h', routeDuration: '1 h 08 min', routeDistance: '11.4 km', status: 'Completed', lastUpdate: 'Heute, 11:04' },
  { id: 'd-4', name: 'Servet Bingöl', vehicle: 'B-SG 1543', location: 'Hannover Nord', lastEvent: 'Fahrerkarte gesteckt', fuelLevel: '90%', speed: '0 km/h', routeDuration: '0 h 40 min', routeDistance: '5.2 km', status: 'Completed', lastUpdate: 'Heute, 09:48' },
  { id: 'd-5', name: 'ALEXANDRU CIBOTARI', vehicle: 'B-SG 1544', location: 'Frankfurt Ost', lastEvent: 'Angefahren', fuelLevel: '61%', speed: '31 km/h', routeDuration: '2 h 29 min', routeDistance: '30.4 km', status: 'In Progress', lastUpdate: 'Heute, 14:03' },
  { id: 'd-6', name: 'ANDRII DUDIAK', vehicle: 'B-SG 1553', location: 'Berlin Süd', lastEvent: 'Angehalten', fuelLevel: '79%', speed: '0 km/h', routeDuration: '1 h 56 min', routeDistance: '20.7 km', status: 'Completed', lastUpdate: 'Heute, 12:43' },
  { id: 'd-7', name: 'Tuncay Erdoğan', vehicle: 'B-SG 1556', location: 'Dortmund West', lastEvent: 'Angefahren', fuelLevel: '55%', speed: '27 km/h', routeDuration: '3 h 02 min', routeDistance: '36.0 km', status: 'In Progress', lastUpdate: 'Heute, 14:00' },
  { id: 'd-8', name: 'Silviu-Ionut Fediuc', vehicle: 'B-SG 1557', location: 'München Zentrum', lastEvent: 'Angehalten', fuelLevel: '88%', speed: '0 km/h', routeDuration: '2 h 18 min', routeDistance: '29.6 km', status: 'Completed', lastUpdate: 'Heute, 10:59' },
  { id: 'd-9', name: 'Nesrin Feyzula', vehicle: 'B-SG 1567', location: 'Prag Nord', lastEvent: 'Angefahren', fuelLevel: '67%', speed: '35 km/h', routeDuration: '2 h 47 min', routeDistance: '33.1 km', status: 'In Progress', lastUpdate: 'Heute, 13:31' },
  { id: 'd-10', name: 'Senan Fikriev', vehicle: 'B-SG 1570', location: 'Wien Süd', lastEvent: 'Angehalten', fuelLevel: '72%', speed: '0 km/h', routeDuration: '1 h 11 min', routeDistance: '9.2 km', status: 'Completed', lastUpdate: 'Heute, 10:10' },
  { id: 'd-11', name: 'Roman Gannizki', vehicle: 'B-TK 710', location: 'Berlin Ost', lastEvent: 'Angefahren', fuelLevel: '81%', speed: '18 km/h', routeDuration: '2 h 22 min', routeDistance: '25.8 km', status: 'In Progress', lastUpdate: 'Heute, 14:02' },
  { id: 'd-12', name: 'Andreas Joachim Gundrum', vehicle: 'B-SG 1540', location: 'Leipzig Zentrum', lastEvent: 'Angehalten', fuelLevel: '63%', speed: '0 km/h', routeDuration: '1 h 43 min', routeDistance: '17.0 km', status: 'Completed', lastUpdate: 'Heute, 12:06' },
  { id: 'd-13', name: 'Sven Hillerkus', vehicle: 'B-SG 1541', location: 'Hamburg Nord', lastEvent: 'Fahrerkarte gesteckt', fuelLevel: '92%', speed: '0 km/h', routeDuration: '0 h 20 min', routeDistance: '2.2 km', status: 'Completed', lastUpdate: 'Heute, 08:55' },
  {
    id: 'd-14',
    name: 'Thorsten Huth',
    vehicle: 'B-TK 710',
    location: 'Ridbacher Straße 89, 12621 Berlin',
    lastEvent: 'Angehalten',
    fuelLevel: '83%',
    speed: '0 km/h',
    routeDuration: '4 h 3 min',
    routeDistance: '31.8 km',
    status: 'Completed',
    lastUpdate: 'Heute, 14:12',
    route: [
      { id: 'r1', label: 'Pablo-Neruda-Straße 22, 12559 Berlin', x: 66, y: 44, type: 'start' },
      { id: 'r2', label: 'Nobelstraße 25, 12057 Berlin', x: 62, y: 48, type: 'stop' },
      { id: 'r3', label: 'Rudolf-Rühl-Allee, 12459 Berlin', x: 69, y: 52, type: 'stop' },
      { id: 'r4', label: 'Ridbacher Straße 89, 12621 Berlin', x: 72, y: 46, type: 'end' },
    ],
  },
  { id: 'd-15', name: 'Vitalie Jalba', vehicle: 'B-SG 1542', location: 'Dresden Mitte', lastEvent: 'Angefahren', fuelLevel: '70%', speed: '16 km/h', routeDuration: '2 h 09 min', routeDistance: '21.2 km', status: 'In Progress', lastUpdate: 'Heute, 13:22' },
  { id: 'd-16', name: 'Mario Kalisch', vehicle: 'B-SG 1543', location: 'Warschau Süd', lastEvent: 'Angehalten', fuelLevel: '58%', speed: '0 km/h', routeDuration: '3 h 10 min', routeDistance: '41.3 km', status: 'Completed', lastUpdate: 'Heute, 12:55' },
  { id: 'd-17', name: 'Sahid Khan', vehicle: 'B-SG 1544', location: 'Berlin Nord', lastEvent: 'Angefahren', fuelLevel: '76%', speed: '20 km/h', routeDuration: '1 h 58 min', routeDistance: '19.7 km', status: 'In Progress', lastUpdate: 'Heute, 14:09' },
  { id: 'd-18', name: 'Andreas Johannes Fritz Kosching', vehicle: 'B-SG 1553', location: 'Frankfurt Süd', lastEvent: 'Angehalten', fuelLevel: '69%', speed: '0 km/h', routeDuration: '2 h 48 min', routeDistance: '32.9 km', status: 'Completed', lastUpdate: 'Heute, 11:37' },
  { id: 'd-19', name: 'Nikolaos Kountouris', vehicle: 'B-SG 1556', location: 'München Ost', lastEvent: 'Angefahren', fuelLevel: '64%', speed: '24 km/h', routeDuration: '2 h 35 min', routeDistance: '28.6 km', status: 'In Progress', lastUpdate: 'Heute, 13:58' },
];

const vehicles: VehicleItem[] = [
  { plate: 'B-SG 1540' },
  { plate: 'B-SG 1541' },
  { plate: 'B-SG 1542' },
  { plate: 'B-SG 1543', archived: true },
  { plate: 'B-SG 1544' },
  { plate: 'B-SG 1553' },
  { plate: 'B-SG 1556' },
  { plate: 'B-SG 1557', archived: true },
  { plate: 'B-SG 1567' },
  { plate: 'B-SG 1570' },
  { plate: 'B-SG 1571' },
  { plate: 'B-SG 1572' },
  { plate: 'B-SG 1573' },
  { plate: 'B-SG 1576', archived: true },
  { plate: 'B-SG 1577' },
  { plate: 'B-SG 1584', archived: true },
  { plate: 'B-TK 710' },
];

const tripSummaries: Record<string, TripSummary> = {
  'B-TK 710': {
    vin: 'WMAN137Z5KY388730',
    routeSummary: '4 h 3 min / 31,8 km',
    startTime: 'Heute, 05:51',
    startAddress: 'Pablo-Neruda-Straße 22, 12559 Berlin, Deutschland',
    endTime: 'Heute, 09:54',
    endAddress: 'Ridbacher Straße 89, 12621 Berlin, Deutschland',
    lastUpdate: 'Heute, 14:12',
    foundEvents: 13,
  },
};

const defaultSummary: TripSummary = {
  vin: 'WVWZZZ1KZ6P000000',
  routeSummary: '2 h 10 min / 18,4 km',
  startTime: 'Heute, 07:20',
  startAddress: 'Depot Berlin Süd, Berlin, Deutschland',
  endTime: 'Heute, 09:30',
  endAddress: 'Alexanderplatz 1, Berlin, Deutschland',
  lastUpdate: 'Heute, 10:15',
  foundEvents: 8,
};

const eventHistory: Record<string, EventItem[]> = {
  'B-TK 710': [
    {
      eventDetails: 'Fahrerkarte gesteckt',
      subtext: 'Thorsten Huth',
      timestamp: '19.05.2026, 05:50',
      driver: 'Thorsten Huth',
      odometer: '260.835,1 km',
      speed: '0 km/h',
      fuel: '89 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Pablo-Neruda-Straße 22, 12559 Berlin, Deutschland',
      distance: 'KEINE DATEN',
      duration: 'KEINE DATEN',
    },
    {
      eventDetails: 'Erste Position im Abfragezeitraum',
      timestamp: '19.05.2026, 05:51',
      driver: 'Thorsten Huth',
      odometer: '260.835,1 km',
      speed: '0 km/h',
      fuel: '89 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Pablo-Neruda-Straße 22, 12559 Berlin, Deutschland',
      distance: '0,0 km',
      duration: '4 s',
    },
    {
      eventDetails: 'Angefahren',
      subtext: 'Stillstandzeit: 13 h 39 min',
      timestamp: '19.05.2026, 05:51',
      driver: 'Thorsten Huth',
      odometer: '260.835,2 km',
      speed: '15 km/h',
      fuel: '91 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Pablo-Neruda-Straße 22, 12559 Berlin, Deutschland',
      distance: '0,0 km',
      duration: '44 s',
    },
    {
      eventDetails: 'Angehalten',
      subtext: 'Fahrzeit: 20 min 59 s',
      timestamp: '19.05.2026, 06:12',
      driver: 'Thorsten Huth',
      odometer: '260.845,5 km',
      speed: '0 km/h',
      fuel: '88 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Nobelstraße 25, 12057 Berlin, Deutschland',
      distance: '10,3 km',
      duration: '20 min 59 s',
    },
    {
      eventDetails: 'Angefahren',
      subtext: 'Stillstandzeit: 2 h 27 min',
      timestamp: '19.05.2026, 08:40',
      driver: 'Thorsten Huth',
      odometer: '260.845,5 km',
      speed: '17 km/h',
      fuel: '82 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Nobelstraße 20, 12057 Berlin, Deutschland',
      distance: '0,0 km',
      duration: '2 h 27 min',
    },
    {
      eventDetails: 'Angehalten',
      subtext: 'Fahrzeit: 23 min 2 s',
      timestamp: '19.05.2026, 09:03',
      driver: 'Thorsten Huth',
      odometer: '260.854,5 km',
      speed: '0 km/h',
      fuel: '83 %',
      chargeStatus: 'KEINE DATEN',
      position: 'Rudolf-Rühl-Allee, 12459 Berlin, Deutschland',
      distance: '9,0 km',
      duration: '23 min 2 s',
    },
  ],
};

const fallbackEvents: EventItem[] = [
  {
    eventDetails: 'Erste Position im Abfragezeitraum',
    timestamp: '19.05.2026, 07:20',
    driver: 'Unbekannt',
    odometer: '120.100,0 km',
    speed: '0 km/h',
    fuel: '76%',
    chargeStatus: 'Keine Daten',
    position: 'Depot Berlin Süd, Berlin',
    distance: '0,0 km',
    duration: '10 s',
  },
];

const fuelRows: FuelEntryRow[] = [
  { id: '211938580', vehicle: 'BR108', date: 'Thu, May 14, 2026 5:26am', vendor: 'Shell', meterEntry: '32 hr', usage: '31.0 hours', volume: '7.296 gallons', total: '€22.52', fuelEconomy: '0.23 g/hr', costPerMeter: '€0.73 / hour', alerts: '—' },
  { id: '211938581', vehicle: 'MV110TRNS', date: 'Thu, May 14, 2026 5:21am', vendor: 'Shell', meterEntry: '160 mi', usage: '112.0 miles', volume: '138.495 gallons', total: '€662.56', fuelEconomy: '0.81 mpg (US)', costPerMeter: '€5.92 / mile', alerts: '—' },
  { id: '211938582', vehicle: 'BC110', date: 'Thu, May 14, 2026 4:59am', vendor: 'Shell', meterEntry: '30 hr', usage: '30.0 hours', volume: '14.095 gallons', total: '€39.34', fuelEconomy: '0.47 g/hr', costPerMeter: '€1.31 / hour', alerts: '—' },
  { id: '211938583', vehicle: 'BSA112TRNS', date: 'Thu, May 14, 2026 4:45am', vendor: 'Shell', meterEntry: '160 mi', usage: '108.0 miles', volume: '143.457 gallons', total: '€649.29', fuelEconomy: '0.75 mpg (US)', costPerMeter: '€6.01 / mile', alerts: '—' },
  { id: '211938584', vehicle: 'BM104', date: 'Thu, May 14, 2026 4:15am', vendor: 'Shell', meterEntry: '30 hr', usage: '30.0 hours', volume: '7.611 gallons', total: '€22.67', fuelEconomy: '0.25 g/hr', costPerMeter: '€0.76 / hour', alerts: '—' },
  { id: '211938585', vehicle: 'AB104', date: 'Thu, May 14, 2026 3:19am', vendor: 'Chevron', meterEntry: '80 hr', usage: '49.0 hours', volume: '16.967 gallons', total: '€69.77', fuelEconomy: '0.35 g/hr', costPerMeter: '€1.42 / hour', alerts: '—' },
  { id: '211938586', vehicle: 'RE103', date: 'Thu, May 14, 2026 3:12am', vendor: 'Chevron', meterEntry: '61 hr', usage: '59.0 hours', volume: '84.938 gallons', total: '€362.43', fuelEconomy: '1.44 g/hr', costPerMeter: '€6.14 / hour', alerts: '—' },
];

function FlottenmonitorTabs({ activeTab, onChange }: { activeTab: MonitorTab; onChange: (tab: MonitorTab) => void }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3">
      {monitorTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
              isActive
                ? 'border-cyan-700 bg-cyan-700 text-white'
                : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function DriverSidebar({
  collapsed,
  onToggleCollapse,
  drivers,
  selectedDriverId,
  onSelectDriver,
  search,
  onSearchChange,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  drivers: DriverRecord[];
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  if (collapsed) {
    return (
      <aside className="hidden w-[68px] shrink-0 border-r border-slate-200 bg-white xl:flex xl:flex-col">
        <button type="button" onClick={onToggleCollapse} className="mx-auto mt-4 rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white xl:flex">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-800">FLOTTENMONITOR</h2>
        <button type="button" onClick={onToggleCollapse} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-slate-200 px-5 py-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Fahrer"
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-2 py-0.5 text-cyan-700 shadow-sm">31</span>
          <span>Fahrer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-2 py-0.5 text-cyan-700 shadow-sm">279</span>
          <span>Fahrzeuge</span>
        </div>
        <button type="button" className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-white">
          <Ellipsis className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          {drivers.map((driver) => {
            const selected = selectedDriverId === driver.id;
            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => onSelectDriver(driver.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  selected
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                    : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{driver.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function MapClusterMarker({ label, count, x, y }: { label: string; count: number; x: number; y: number }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg bg-slate-800/95 px-3 py-2 text-xs font-semibold text-white shadow-lg">
        <Bus className="h-3.5 w-3.5" />
        <span>{count}</span>
      </div>
      <div className="mt-1 -translate-x-1/2 text-center text-[11px] font-medium text-slate-600">{label}</div>
    </div>
  );
}

function DriverRouteOverlay({ points }: { points: RoutePoint[] }) {
  if (points.length < 2) return null;

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <polyline points={polyline} fill="none" stroke="#06b6d4" strokeWidth="0.7" strokeDasharray="1 0" />
      </svg>

      {points.map((point) => (
        <div key={point.id} className="absolute" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
          <div
            className={`h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${
              point.type === 'start' ? 'bg-emerald-500' : point.type === 'end' ? 'bg-rose-500' : 'bg-cyan-500'
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function DriverRouteCard({ driver }: { driver: DriverRecord }) {
  return (
    <div className="absolute left-6 top-6 z-20 w-[320px] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
      <p className="text-xs uppercase tracking-wide text-slate-500">Selected route</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{driver.name}</h3>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p>Vehicle: <span className="font-medium text-slate-900">{driver.vehicle}</span></p>
        <p>Route duration: <span className="font-medium text-slate-900">{driver.routeDuration}</span></p>
        <p>Distance: <span className="font-medium text-slate-900">{driver.routeDistance}</span></p>
        <p>Status: <span className="font-medium text-slate-900">{driver.status}</span></p>
        <p>Last update: <span className="font-medium text-slate-900">{driver.lastUpdate}</span></p>
      </div>
    </div>
  );
}

function MapControls() {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
      <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"><Layers className="h-4 w-4" />Layers</button>
      <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"><MapPinned className="h-4 w-4" />Geofences</button>
      <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"><ShieldAlert className="h-4 w-4" />Warnings</button>
      <button type="button" className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
      <button type="button" className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
    </div>
  );
}

function ÜbersichtMap({
  selectedDriver,
  listViewOpen,
  onToggleListView,
  onOpenHistory,
}: {
  selectedDriver: DriverRecord | null;
  listViewOpen: boolean;
  onToggleListView: () => void;
  onOpenHistory: () => void;
}) {
  const cityLabels = [
    { label: 'Berlin', x: 68, y: 46 },
    { label: 'Hamburg', x: 58, y: 30 },
    { label: 'Hannover', x: 55, y: 38 },
    { label: 'Dortmund', x: 45, y: 46 },
    { label: 'Leipzig', x: 63, y: 52 },
    { label: 'Dresden', x: 67, y: 57 },
    { label: 'Frankfurt', x: 50, y: 59 },
    { label: 'München', x: 55, y: 78 },
    { label: 'Wien', x: 72, y: 84 },
    { label: 'Prag', x: 68, y: 68 },
    { label: 'Warschau', x: 83, y: 50 },
  ];

  const countryLabels = [
    { label: 'Deutschland', x: 55, y: 55 },
    { label: 'Polen', x: 82, y: 58 },
    { label: 'Tschechien', x: 69, y: 71 },
    { label: 'Österreich', x: 65, y: 82 },
    { label: 'Niederlande', x: 39, y: 49 },
    { label: 'Belgien', x: 37, y: 56 },
  ];

  const clusters = [
    { label: 'Berlin', count: 18, x: 69, y: 47 },
    { label: 'Dortmund', count: 2, x: 46, y: 47 },
    { label: 'Stuttgart/München', count: 5, x: 56, y: 76 },
  ];

  return (
    <div className="relative h-full min-h-[760px] overflow-hidden rounded-r-xl bg-gradient-to-br from-slate-100 via-green-50 to-slate-200">
      <div className="absolute inset-0">
        <div className="absolute -left-8 top-20 h-44 w-80 rounded-full bg-cyan-200/50" />
        <div className="absolute right-10 top-10 h-56 w-96 rounded-full bg-cyan-200/35" />
        <div className="absolute left-24 bottom-24 h-52 w-96 rounded-full bg-cyan-200/40" />
      </div>

      <div className="absolute right-4 top-4 z-20">
        <button type="button" onClick={onToggleListView} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          Listenansicht
        </button>
      </div>

      {listViewOpen && (
        <div className="absolute right-4 top-16 z-20 w-[280px] rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-lg">
          Listenansicht placeholder
        </div>
      )}

      <div className="absolute inset-0 z-0">
        {countryLabels.map((item) => (
          <div key={item.label} className="absolute text-xs font-semibold text-slate-400" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
            {item.label}
          </div>
        ))}
        {cityLabels.map((item) => (
          <div key={item.label} className="absolute text-xs font-medium text-slate-600" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
            {item.label}
          </div>
        ))}
      </div>

      {!selectedDriver && (
        <>
          {clusters.map((cluster) => (
            <MapClusterMarker key={cluster.label} label={cluster.label} count={cluster.count} x={cluster.x} y={cluster.y} />
          ))}
        </>
      )}

      {selectedDriver && selectedDriver.route && (
        <>
          <DriverRouteOverlay points={selectedDriver.route} />
          <DriverRouteCard driver={selectedDriver} />

          <div className="absolute bottom-6 left-6 z-20 w-[340px] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <h4 className="text-base font-semibold text-slate-900">{selectedDriver.name}</h4>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p>Vehicle plate: <span className="font-medium text-slate-900">{selectedDriver.vehicle}</span></p>
              <p>Current/last location: <span className="font-medium text-slate-900">{selectedDriver.location}</span></p>
              <p>Last event: <span className="font-medium text-slate-900">{selectedDriver.lastEvent}</span></p>
              <p>Fuel level: <span className="font-medium text-slate-900">{selectedDriver.fuelLevel}</span></p>
              <p>Speed: <span className="font-medium text-slate-900">{selectedDriver.speed}</span></p>
            </div>
            <button
              type="button"
              onClick={onOpenHistory}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
            >
              Fahrhistorie öffnen
            </button>
          </div>
        </>
      )}

      <MapControls />
    </div>
  );
}

function VehicleListSidebar({
  vehicles,
  selectedVehicle,
  search,
  onSearchChange,
  onSelect,
}: {
  vehicles: VehicleItem[];
  selectedVehicle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (plate: string) => void;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-slate-200 bg-white xl:w-[320px]">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-800">FLOTTENMONITOR</h2>
      </div>

      <div className="border-b border-slate-200 px-5 py-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Finden Sie Ihr Fahrzeug"
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Nicht gruppiert</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-cyan-700 shadow-sm">50</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          {vehicles.map((vehicle) => {
            const selected = selectedVehicle === vehicle.plate;
            return (
              <button
                key={vehicle.plate}
                type="button"
                onClick={() => onSelect(vehicle.plate)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${
                  selected
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                    : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className={`h-4 w-4 rounded-full border ${selected ? 'border-cyan-700 bg-cyan-700' : 'border-slate-300 bg-white'}`}>
                  <span className={`m-[3px] block h-2 w-2 rounded-full ${selected ? 'bg-white' : 'bg-transparent'}`} />
                </span>
                <Truck className="h-4 w-4 shrink-0 text-cyan-700" />
                <span className="flex-1 text-sm font-medium">{vehicle.plate}</span>
                {vehicle.archived && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Archiviert
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function TripSummaryCard({ vehicle, summary }: { vehicle: string; summary: TripSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Vehicle</p>
            <p className="font-semibold text-slate-900">{vehicle}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">VIN</p>
            <p className="font-semibold text-slate-900">{summary.vin}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Plate</p>
            <p className="font-semibold text-slate-900">{vehicle}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Route summary</p>
            <p className="font-semibold text-cyan-800">{summary.routeSummary}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Start</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{summary.startTime}</p>
            <p className="mt-1 text-xs text-slate-600">{summary.startAddress}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">End</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{summary.endTime}</p>
            <p className="mt-1 text-xs text-slate-600">{summary.endAddress}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Last update</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{summary.lastUpdate}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Found events</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Anzahl der gefundenen Events: {summary.foundEvents}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventHistoryTable({ events }: { events: EventItem[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1560px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-3">Ereignisdetails</th>
              <th className="border-b border-slate-200 px-3 py-3">Zeitstempel</th>
              <th className="border-b border-slate-200 px-3 py-3">Fahrer</th>
              <th className="border-b border-slate-200 px-3 py-3">Kilometerstand</th>
              <th className="border-b border-slate-200 px-3 py-3">Geschwindigkeit</th>
              <th className="border-b border-slate-200 px-3 py-3">Tankfüllstand</th>
              <th className="border-b border-slate-200 px-3 py-3">Ladestatus</th>
              <th className="border-b border-slate-200 px-3 py-3">Position</th>
              <th className="border-b border-slate-200 px-3 py-3">Entfernung</th>
              <th className="border-b border-slate-200 px-3 py-3">Dauer</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.timestamp}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-900">
                  <p className="font-semibold">{event.eventDetails}</p>
                  {event.subtext && <p className="text-[11px] text-slate-500">{event.subtext}</p>}
                </td>
                <td className="px-3 py-2 text-slate-700">{event.timestamp}</td>
                <td className="px-3 py-2 text-slate-700">{event.driver}</td>
                <td className="px-3 py-2 text-slate-700">{event.odometer}</td>
                <td className="px-3 py-2 text-slate-700">{event.speed}</td>
                <td className="px-3 py-2 text-slate-700">{event.fuel}</td>
                <td className="px-3 py-2 text-slate-700">{event.chargeStatus}</td>
                <td className="max-w-[360px] px-3 py-2 text-slate-700">{event.position}</td>
                <td className="px-3 py-2 text-slate-700">{event.distance}</td>
                <td className="px-3 py-2 text-slate-700">{event.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FuelSummaryCards() {
  const items = [
    { label: 'Total Fuel Cost', value: '€34,759.34' },
    { label: 'Total Volume', value: '7,485.89 gallons' },
    { label: 'Avg. Fuel Economy (Distance)', value: '20.27 mpg (US)' },
    { label: 'Avg. Fuel Economy (Hours)', value: '6.78 g/hr (US)' },
    { label: 'Avg. Cost', value: '€4.64 / gallon' },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function FuelHistoryTable({ rows, onRowClick }: { rows: FuelEntryRow[]; onRowClick: (row: FuelEntryRow) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-3"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" /></th>
              <th className="border-b border-slate-200 px-3 py-3">Vehicle</th>
              <th className="border-b border-slate-200 px-3 py-3">Date</th>
              <th className="border-b border-slate-200 px-3 py-3">Vendor</th>
              <th className="border-b border-slate-200 px-3 py-3">Meter Entry</th>
              <th className="border-b border-slate-200 px-3 py-3">Usage</th>
              <th className="border-b border-slate-200 px-3 py-3">Volume</th>
              <th className="border-b border-slate-200 px-3 py-3">Total</th>
              <th className="border-b border-slate-200 px-3 py-3">Fuel Economy</th>
              <th className="border-b border-slate-200 px-3 py-3">Cost per Meter</th>
              <th className="border-b border-slate-200 px-3 py-3">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onRowClick(row)}>
                <td className="px-3 py-2.5"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" onClick={(event) => event.stopPropagation()} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-slate-200" />
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-700">{row.vehicle}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Sample</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{row.date}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    <span className="font-medium text-emerald-700">{row.vendor}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{row.meterEntry}</td>
                <td className="px-3 py-2.5 text-slate-700">{row.usage}</td>
                <td className="px-3 py-2.5 text-slate-700">{row.volume}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">{row.total}</td>
                <td className="px-3 py-2.5 text-slate-700">{row.fuelEconomy}</td>
                <td className="px-3 py-2.5 text-slate-700">{row.costPerMeter}</td>
                <td className="px-3 py-2.5 text-slate-700">{row.alerts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FuelMetricCard({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'red' | 'green';
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {delta && (
        <p className={`mt-1 text-xs font-medium ${deltaTone === 'green' ? 'text-emerald-600' : 'text-rose-600'}`}>{delta}</p>
      )}
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className="relative h-[230px] overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-slate-50 to-white">
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div className="absolute left-8 top-8 text-xs text-slate-400">Rudolf-Rühl-Allee</div>
      <div className="absolute right-10 top-20 text-xs text-slate-400">Nobelstraße</div>
      <div className="absolute bottom-12 left-14 text-xs text-slate-400">Pablo-Neruda-Straße</div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 p-2 text-white shadow-lg">
        <Fuel className="h-5 w-5" />
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <button type="button" className="rounded border border-slate-300 bg-white p-1.5 text-slate-600">+</button>
        <button type="button" className="rounded border border-slate-300 bg-white p-1.5 text-slate-600">-</button>
      </div>
    </div>
  );
}

function FuelEntryDetail({ row, onBack }: { row: FuelEntryRow; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button type="button" onClick={onBack} className="text-sm font-medium text-emerald-700 hover:text-emerald-800">← Fuel History</button>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Fuel Entry #{row.id}</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Eye className="mr-2 inline h-4 w-4" />Watch</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Ellipsis className="mr-2 inline h-4 w-4" />More</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil className="mr-2 inline h-4 w-4" />Edit</button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Details</h3>
          <p className="text-sm text-slate-500">All Fields</p>
          <div className="mt-4 space-y-3 text-sm">
            <div><span className="text-slate-500">Vehicle:</span> <span className="ml-2 inline-flex items-center gap-2"><span className="h-7 w-7 rounded-md bg-slate-200" /><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="font-medium text-slate-900">BR108</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Sample</span></span></div>
            <div><span className="text-slate-500">Date:</span> <span className="ml-2 font-medium text-slate-900">05/14/2026 5:26am</span></div>
            <div><span className="text-slate-500">Odometer:</span> <span className="ml-2 font-medium text-slate-900">32 hr</span></div>
            <div><span className="text-slate-500">Vendor:</span> <span className="ml-2 font-medium text-slate-900">Shell</span></div>
            <div><span className="text-slate-500">Fuel Type:</span> <span className="ml-2 font-medium text-slate-900">—</span></div>
            <div><span className="text-slate-500">Fuel Card:</span> <span className="ml-2 font-medium text-slate-900">No</span></div>
            <div><span className="text-slate-500">Reference:</span> <span className="ml-2 font-medium text-slate-900">—</span></div>
            <div><span className="text-slate-500">Previous Entry:</span> <span className="ml-2 font-medium text-slate-900">04/25/2026 11:08pm</span></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Metrics</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FuelMetricCard label="Volume" value="7.296 gallons (US)" delta="▲ 7.30 (Infinity%)" deltaTone="red" />
              <FuelMetricCard label="Fuel Price" value="€3.0870 / gallon" delta="▲ €0.01 (0.3%)" deltaTone="red" />
              <FuelMetricCard label="Total" value="€22.52" delta="▲ €22.52 (0.0%)" deltaTone="red" />
              <FuelMetricCard label="Usage" value="31.0 hours" />
              <FuelMetricCard label="Fuel Economy" value="0.23 g/hr" delta="▼ 3.484 (93.7%)" deltaTone="red" />
              <FuelMetricCard label="Cost" value="€0.73 / hour" delta="▼ €10.71 (93.6%)" deltaTone="green" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Location</h3>
            <MapPlaceholder />
          </div>
        </div>
      </div>
    </div>
  );
}

function Fahrhistorie({ selectedVehicle }: { selectedVehicle: string }) {
  const [tableSearch, setTableSearch] = useState('');
  const summary = tripSummaries[selectedVehicle] ?? defaultSummary;
  const events = eventHistory[selectedVehicle] ?? fallbackEvents;

  const filteredEvents = useMemo(() => {
    if (!tableSearch.trim()) return events;
    const query = tableSearch.toLowerCase();
    return events.filter((event) =>
      [event.eventDetails, event.timestamp, event.driver, event.position].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [events, tableSearch]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 sm:grid-cols-[190px_190px_auto]">
            <input defaultValue="19.05.2026 00:00" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none" />
            <input defaultValue="19.05.2026 09:57" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none" />
            <button type="button" className="h-9 rounded-md border border-cyan-700 bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800">
              Filter
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Suche in der Tabelle..."
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none"
              />
            </label>
            <div className="flex gap-1.5">
              <button type="button" title="Tabellenansicht" className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Columns3 className="h-4 w-4" /></button>
              <button type="button" title="Download" className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Download className="h-4 w-4" /></button>
              <button type="button" title="Einstellungen" className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Settings2 className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>

      <TripSummaryCard vehicle={selectedVehicle} summary={summary} />
      <EventHistoryTable events={filteredEvents} />
    </div>
  );
}

function FuelHistoryPage() {
  const [query, setQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<FuelEntryRow | null>(null);

  const rows = useMemo(() => {
    if (!query.trim()) return fuelRows;
    const normalized = query.toLowerCase();
    return fuelRows.filter((row) => [row.vehicle, row.vendor, row.date].some((v) => v.toLowerCase().includes(normalized)));
  }, [query]);

  if (selectedEntry) {
    return <FuelEntryDetail row={selectedEntry} onBack={() => setSelectedEntry(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">Fuel History</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Learn</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Ellipsis className="mr-2 inline h-4 w-4" />More</button>
            <button type="button" className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="mr-2 inline h-4 w-4" />Add Fuel Entry</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="relative block xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search input" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none" />
            </label>
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"><option>Date filter</option></select>
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"><option>Vehicle filter</option></select>
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"><option>Vehicle Group</option></select>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Filters <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs text-white">1</span></button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">1 - 50 of 88</span>
            <button type="button" className="rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"><option>Group: None</option></select>
            <button type="button" className="rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><Settings2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <FuelSummaryCards />
      <FuelHistoryTable rows={rows} onRowClick={setSelectedEntry} />
    </div>
  );
}

export function FlottenmonitorPage({ initialTab }: { initialTab?: string }) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MonitorTab>(
    initialTab === 'overview' || initialTab === 'pois' || initialTab === 'history' || initialTab === 'fuel' || initialTab === 'sharing'
      ? initialTab
      : 'overview',
  );
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('B-TK 710');
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>('d-14');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overviewListViewOpen, setOverviewListViewOpen] = useState(false);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;
    return vehicles.filter((vehicle) => vehicle.plate.toLowerCase().includes(vehicleSearch.toLowerCase()));
  }, [vehicleSearch]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return drivers;
    return drivers.filter((driver) => driver.name.toLowerCase().includes(driverSearch.toLowerCase()));
  }, [driverSearch]);

  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [selectedDriverId],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 450);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('flottenmonitor.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('flottenmonitor.subtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#eef3f7] shadow-sm">
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
              <Skeleton className="h-[420px]" />
              <Skeleton className="h-[420px]" />
            </div>
          </div>
        ) : (
        <>
        <FlottenmonitorTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' && (
          <div className="flex min-h-[780px]">
            {filteredDrivers.length === 0 ? (
              <div className="m-4 w-full">
                <EmptyState
                  icon={Truck}
                  title="No drivers found"
                  subtitle="No drivers match current filters in Flottenmonitor."
                />
              </div>
            ) : (
              <DriverSidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
                drivers={filteredDrivers}
                selectedDriverId={selectedDriverId}
                onSelectDriver={setSelectedDriverId}
                search={driverSearch}
                onSearchChange={setDriverSearch}
              />
            )}

            <main className="min-h-0 flex-1 p-0">
              <ÜbersichtMap
                selectedDriver={selectedDriver}
                listViewOpen={overviewListViewOpen}
                onToggleListView={() => setOverviewListViewOpen((current) => !current)}
                onOpenHistory={() => {
                  if (selectedDriver) {
                    setSelectedVehicle(selectedDriver.vehicle);
                  }
                  setActiveTab('history');
                }}
              />
            </main>
          </div>
        )}

        {activeTab === 'fuel' && (
          <div className="p-4">
            <FuelHistoryPage />
          </div>
        )}

        {(activeTab === 'history' || activeTab === 'pois' || activeTab === 'sharing') && (
          <div className="flex min-h-[780px] flex-col xl:flex-row">
            {filteredVehicles.length === 0 ? (
              <div className="m-4 w-full xl:w-80">
                <EmptyState
                  icon={Bus}
                  title="No vehicles found"
                  subtitle="No vehicles match current filters."
                />
              </div>
            ) : (
              <VehicleListSidebar
                vehicles={filteredVehicles}
                selectedVehicle={selectedVehicle}
                search={vehicleSearch}
                onSearchChange={setVehicleSearch}
                onSelect={setSelectedVehicle}
              />
            )}

            <main className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeTab === 'history' && <Fahrhistorie selectedVehicle={selectedVehicle} />}
              {activeTab === 'pois' && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-sm text-slate-500 shadow-sm">
                  Geofence management coming soon
                </div>
              )}
              {activeTab === 'sharing' && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-sm text-slate-500 shadow-sm">
                  Position sharing coming soon
                </div>
              )}
            </main>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
