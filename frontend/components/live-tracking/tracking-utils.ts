import type { LiveTrackingItem, LiveTrackingStatus } from '@/lib/types';

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
