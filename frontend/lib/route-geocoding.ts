export interface GeoPoint {
  lat: number;
  lng: number;
  displayName: string;
}

export interface DrivingRouteResult {
  pickup: GeoPoint;
  delivery: GeoPoint;
  coordinates: Array<[number, number]>;
  distanceMeters: number;
  durationSeconds: number;
}

export async function fetchDrivingRoute(
  pickupAddress: string,
  deliveryAddress: string,
): Promise<DrivingRouteResult | null> {
  const params = new URLSearchParams({
    pickup: pickupAddress.trim(),
    delivery: deliveryAddress.trim(),
  });

  const response = await fetch(`/api/route-map?${params.toString()}`);
  if (!response.ok) return null;

  return (await response.json()) as DrivingRouteResult;
}

export function formatRouteDistance(meters: number, locale = 'de-DE'): string {
  const km = meters / 1000;
  if (km < 1) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(meters) + ' m';
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(km) + ' km';
}

export function formatRouteDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
