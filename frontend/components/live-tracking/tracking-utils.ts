import type { LiveTrackingItem, LiveTrackingStatus, LocationSourceType } from '@/lib/types';

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

export const SOURCE_MARKER_COLORS: Record<LocationSourceType, string> = {
  mobile: '#16a34a',
  telematics: '#1a4d7a',
};

export function sourceBadgeClass(source: LocationSourceType | null | undefined): string {
  if (source === 'telematics') {
    return 'bg-[#e8f0f8] text-[#1a4d7a] border border-[#1a4d7a]/20';
  }
  if (source === 'mobile') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }
  return 'bg-slate-100 text-slate-500 border border-slate-200';
}

export function markerFillColor(item: LiveTrackingItem): string {
  if (item.locationSource === 'telematics') {
    return SOURCE_MARKER_COLORS.telematics;
  }
  return STATUS_MARKER_COLORS[item.status];
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

export function filterByStatus(items: LiveTrackingItem[], statusFilter: StatusFilter): LiveTrackingItem[] {
  if (statusFilter === 'all') {
    return items;
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
