export type TripStopSlice = {
  tripId: string;
  startedAt: Date;
  endedAt: Date | null;
  startCoordinate: { lat: number; lng: number } | null;
  endCoordinate: { lat: number; lng: number } | null;
  routeStartLabel: string | null;
  routeEndLabel: string | null;
};

export type FleetTripStop = {
  kind: 'stop';
  afterTripId: string;
  beforeTripId: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  label: string;
  coordinates: { lat: number; lng: number } | null;
  tooltip: string;
};

const MIN_STOP_MINUTES = 5;

export function deriveTripStops(trips: TripStopSlice[]): FleetTripStop[] {
  const stops: FleetTripStop[] = [];

  for (let index = 0; index < trips.length - 1; index += 1) {
    const current = trips[index];
    const next = trips[index + 1];
    if (!current.endedAt) {
      continue;
    }

    if (!isSameCalendarDay(current.endedAt, next.startedAt)) {
      continue;
    }

    const durationS = Math.round((next.startedAt.getTime() - current.endedAt.getTime()) / 1000);
    if (durationS < MIN_STOP_MINUTES * 60) {
      continue;
    }

    const coordinate = current.endCoordinate ?? next.startCoordinate ?? null;
    const label = current.routeEndLabel ?? next.routeStartLabel ?? 'Konum';
    const coordinateLabel = coordinate
      ? `${coordinate.lat.toFixed(5)}, ${coordinate.lng.toFixed(5)}`
      : null;

    stops.push({
      kind: 'stop',
      afterTripId: current.tripId,
      beforeTripId: next.tripId,
      startedAt: current.endedAt.toISOString(),
      endedAt: next.startedAt.toISOString(),
      durationS,
      label,
      coordinates: coordinate,
      // Keep the display string close to the server-side provenance.
      // The UI can still render the raw coordinates separately if needed.
      tooltip: coordinateLabel ? `${label} · ${coordinateLabel}` : label,
    });
  }

  return stops;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}