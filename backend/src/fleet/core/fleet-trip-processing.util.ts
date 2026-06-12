import type { FleetTripProcessingConfig } from './fleet-trip-processing.config';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';

export type ProcessableTripPoint = {
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  accuracyM: number | null;
};

export type FleetTripProcessingResult = {
  distanceKm: number;
  durationS: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  idleS: number;
  hasDataGap: boolean;
};

export function filterPointsForProcessing(
  points: ProcessableTripPoint[],
  maxAccuracyM: number,
): ProcessableTripPoint[] {
  return [...points]
    .filter((point) => point.accuracyM === null || point.accuracyM <= maxAccuracyM)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function resolvePointSpeedKmh(
  point: ProcessableTripPoint,
  previous: ProcessableTripPoint | null,
): number | null {
  if (point.speedKmh !== null && point.speedKmh >= 0) {
    return point.speedKmh;
  }
  if (!previous) {
    return null;
  }

  const deltaMs = point.recordedAt.getTime() - previous.recordedAt.getTime();
  if (deltaMs <= 0) {
    return null;
  }

  const distanceKm = haversineDistanceKm(
    previous.latitude,
    previous.longitude,
    point.latitude,
    point.longitude,
  );

  return distanceKm / (deltaMs / 3_600_000);
}

export function computeTripMetrics(
  points: ProcessableTripPoint[],
  tripStartedAt: Date,
  tripEndedAt: Date,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): FleetTripProcessingResult {
  const filtered = filterPointsForProcessing(points, config.maxAccuracyM);
  const durationS = Math.max(
    0,
    Math.round((tripEndedAt.getTime() - tripStartedAt.getTime()) / 1000),
  );

  let distanceKm = 0;
  let idleS = 0;
  let maxSpeedKmh: number | null = null;
  let hasDataGap = false;

  if (filtered.length === 0) {
    return {
      distanceKm: 0,
      durationS,
      avgSpeedKmh: null,
      maxSpeedKmh: null,
      idleS: 0,
      hasDataGap: durationS * 1000 >= config.dataGapThresholdMs,
    };
  }

  if (
    filtered[0]!.recordedAt.getTime() - tripStartedAt.getTime() >=
    config.dataGapThresholdMs
  ) {
    hasDataGap = true;
  }

  if (
    tripEndedAt.getTime() - filtered[filtered.length - 1]!.recordedAt.getTime() >=
    config.dataGapThresholdMs
  ) {
    hasDataGap = true;
  }

  for (let index = 0; index < filtered.length; index += 1) {
    const current = filtered[index]!;
    const previous = index > 0 ? filtered[index - 1]! : null;
    const speedKmh = resolvePointSpeedKmh(current, previous);

    if (speedKmh !== null) {
      maxSpeedKmh = maxSpeedKmh === null ? speedKmh : Math.max(maxSpeedKmh, speedKmh);
    }

    if (!previous) {
      continue;
    }

    const deltaMs = current.recordedAt.getTime() - previous.recordedAt.getTime();
    if (deltaMs <= 0) {
      continue;
    }

    if (deltaMs >= config.dataGapThresholdMs) {
      hasDataGap = true;
    }

    const segmentDistanceKm = haversineDistanceKm(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude,
    );
    const segmentSpeedKmh = segmentDistanceKm / (deltaMs / 3_600_000);

    if (segmentSpeedKmh <= config.maxSegmentSpeedKmh) {
      distanceKm += segmentDistanceKm;
    }

    const idleSpeed = speedKmh ?? segmentSpeedKmh;
    if (idleSpeed < config.idleSpeedKmh) {
      idleS += Math.round(deltaMs / 1000);
    }
  }

  const avgSpeedKmh =
    durationS > 0 && distanceKm > 0
      ? Number((distanceKm / (durationS / 3600)).toFixed(2))
      : null;

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    durationS,
    avgSpeedKmh,
    maxSpeedKmh: maxSpeedKmh === null ? null : Number(maxSpeedKmh.toFixed(2)),
    idleS,
    hasDataGap,
  };
}
