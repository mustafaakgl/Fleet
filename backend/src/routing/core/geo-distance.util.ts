const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in metres.
 *
 * Used only to rank suggestions against the operating region, never to report a
 * travel distance — road distance comes from Valhalla. Straight-line is the right
 * measure here: it answers "which of these identically named streets is ours",
 * and asking the router for a matrix on every keystroke would be absurd.
 */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Reads the configured operating-region anchor, or null when it is unset. */
export function readRegionAnchor(): GeoPoint | null {
  const latitude = Number(process.env.ROUTING_ACCESS_PROBE_LAT);
  const longitude = Number(process.env.ROUTING_ACCESS_PROBE_LON);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  // 0,0 is in the Gulf of Guinea — it is an unset value, not an anchor.
  if (latitude === 0 && longitude === 0) {
    return null;
  }

  return { latitude, longitude };
}
