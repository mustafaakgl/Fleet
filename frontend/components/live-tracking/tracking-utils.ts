import { TELEMATICS_THRESHOLDS } from '@/lib/telematics-thresholds';
import type {
  LiveTrackingItem,
  LiveTrackingMotionState,
  LiveTrackingStatus,
  LocationSourceType,
} from '@/lib/types';

export function toCoordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasMapCoordinates(item: LiveTrackingItem): boolean {
  return toCoordinate(item.latitude) !== null && toCoordinate(item.longitude) !== null;
}

export const STATUS_MARKER_COLORS: Record<LiveTrackingStatus, string> = {
  online: '#16a34a',
  stale: '#d97706',
  offline: '#6b7280',
};

export const MOTION_MARKER_COLORS: Record<LiveTrackingMotionState, string> = {
  moving: '#16a34a',
  idle: '#d97706',
  stopped: '#9ca3af',
  offline: '#6b7280',
};

export const SOURCE_MARKER_COLORS: Record<LocationSourceType, string> = {
  mobile: '#16a34a',
  telematics: '#1a4d7a',
};

export function sourceBadgeClass(source: LocationSourceType | null | undefined): string {
  if (source === 'telematics') {
    return 'bg-surface text-brand-primary border border-brand-primary/20';
  }
  if (source === 'mobile') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }
  return 'bg-slate-100 text-slate-500 border border-slate-200';
}

export function markerFillColor(item: LiveTrackingItem): string {
  return MOTION_MARKER_COLORS[item.motionState];
}

export function markerStrokeOptions(item: LiveTrackingItem): { color: string; weight: number; dashArray?: string } {
  if (item.locationSource === 'telematics') {
    return { color: '#ffffff', weight: 3 };
  }
  return { color: '#ffffff', weight: item.status === 'online' ? 2 : 2 };
}

export function statusBadgeVariant(status: LiveTrackingStatus): 'success' | 'warning' | 'secondary' {
  switch (status) {
    case 'online':
      return 'success';
    case 'stale':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function motionBadgeClass(motionState: LiveTrackingMotionState): string {
  if (motionState === 'moving') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  if (motionState === 'idle') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (motionState === 'stopped') return 'bg-slate-100 text-slate-700 border border-slate-200';
  return 'bg-slate-200 text-slate-600 border border-slate-300';
}

export function isAlarmItem(item: LiveTrackingItem): boolean {
  return item.hasCriticalDtc || item.fuelDropFlag || item.isSilent;
}

export function formatTrackingTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatSpeed(speedKmh: number | null | undefined): string {
  if (speedKmh === null || speedKmh === undefined) {
    return '—';
  }
  return `${Math.round(speedKmh)} km/h`;
}

export type StatusFilter = 'all' | LiveTrackingStatus;

export type LiveTrackingStateFilter = StatusFilter | LiveTrackingMotionState | 'alarm';

export function filterByStatus(items: LiveTrackingItem[], statusFilter: LiveTrackingStateFilter): LiveTrackingItem[] {
  if (statusFilter === 'all') {
    return items;
  }
  if (statusFilter === 'alarm') {
    return items.filter((item) => isAlarmItem(item));
  }
  if (statusFilter === 'moving' || statusFilter === 'idle' || statusFilter === 'stopped') {
    return items.filter((item) => item.motionState === statusFilter);
  }
  return items.filter((item) => item.status === statusFilter);
}

export type SourceFilter = 'all' | LocationSourceType;

export function filterBySource(items: LiveTrackingItem[], sourceFilter: SourceFilter): LiveTrackingItem[] {
  if (sourceFilter === 'all') {
    return items;
  }
  return items.filter((item) => item.locationSource === sourceFilter);
}

export function countBySource(items: LiveTrackingItem[]) {
  return {
    mobile: items.filter((item) => item.locationSource === 'mobile').length,
    telematics: items.filter((item) => item.locationSource === 'telematics').length,
  };
}

export function estimateIdleFuelLabel(idleSinceMs: number, nowMs = Date.now()): string {
  const minutes = Math.max(0, Math.floor((nowMs - idleSinceMs) / 60_000));
  const liters = (minutes / 60) * TELEMATICS_THRESHOLDS.idleFuelLitersPerHourBlend;
  return `~${liters.toFixed(1)} L`;
}

export function estimateIdleCostEur(idleSinceMs: number, nowMs = Date.now()): number {
  const minutes = Math.max(0, Math.floor((nowMs - idleSinceMs) / 60_000));
  const liters = (minutes / 60) * TELEMATICS_THRESHOLDS.idleFuelLitersPerHourBlend;
  return liters * TELEMATICS_THRESHOLDS.defaultFuelEurPerLiter;
}
