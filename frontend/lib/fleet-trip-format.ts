export function fleetTripNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatFleetTripDistance(
  km: number | string | null | undefined,
  fallback = '—',
): string {
  const value = fleetTripNumber(km);
  if (value == null) return fallback;
  return `${value.toFixed(1)} km`;
}

export function formatFleetTripSpeed(
  kmh: number | string | null | undefined,
  fallback = '—',
): string {
  const value = fleetTripNumber(kmh);
  if (value == null) return fallback;
  return `${Math.round(value)} km/h`;
}

export function formatFleetTripDurationSeconds(
  seconds: number | null | undefined,
  t: (key: string, opts?: Record<string, string | number>) => string,
): string {
  if (seconds == null || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return t('fleetTrips.durationHoursMinutes', { hours, minutes });
  }
  return t('fleetTrips.durationMinutes', { minutes });
}

export function formatFleetTripScore(
  score: number | string | null | undefined,
  fallback = '—',
): string {
  const value = fleetTripNumber(score);
  if (value == null) return fallback;
  return Math.round(value).toString();
}
