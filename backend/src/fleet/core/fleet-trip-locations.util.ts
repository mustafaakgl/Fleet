import { BadRequestException } from '@nestjs/common';
import { FleetTelemetrySource } from '@prisma/client';
import type {
  FleetTripLocationPointDto,
  NormalizedFleetTripLocationPoint,
} from './fleet-trips.types';

export const MAX_LOCATION_BATCH_SIZE = 500;
export const MAX_RECORDED_AT_FUTURE_MS = 5 * 60 * 1000;
export const MAX_RECORDED_AT_AGE_MS = 24 * 60 * 60 * 1000;

export function parseFleetTripRecordedAt(value: string, now = new Date()): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid recordedAt timestamp');
  }

  const ageMs = now.getTime() - parsed.getTime();
  if (ageMs < -MAX_RECORDED_AT_FUTURE_MS) {
    throw new BadRequestException('recordedAt cannot be more than 5 minutes in the future');
  }
  if (ageMs > MAX_RECORDED_AT_AGE_MS) {
    throw new BadRequestException('recordedAt is too old');
  }

  return parsed;
}

export function normalizeFleetTripLocationPoints(
  points: FleetTripLocationPointDto[],
  source: FleetTelemetrySource = FleetTelemetrySource.phone,
  now = new Date(),
): NormalizedFleetTripLocationPoint[] {
  if (points.length === 0) {
    throw new BadRequestException('At least one location point is required');
  }
  if (points.length > MAX_LOCATION_BATCH_SIZE) {
    throw new BadRequestException(`At most ${MAX_LOCATION_BATCH_SIZE} points per batch`);
  }

  return points.map((point, index) => {
    if (point.lat < -90 || point.lat > 90) {
      throw new BadRequestException(`points[${index}].lat is out of range`);
    }
    if (point.lng < -180 || point.lng > 180) {
      throw new BadRequestException(`points[${index}].lng is out of range`);
    }

    return {
      recordedAt: parseFleetTripRecordedAt(point.recordedAt, now),
      latitude: point.lat,
      longitude: point.lng,
      speedKmh:
        point.speedKmh !== undefined && point.speedKmh >= 0 ? point.speedKmh : null,
      headingDeg:
        point.heading !== undefined && point.heading >= 0 && point.heading <= 360
          ? point.heading
          : null,
      accuracyM:
        point.accuracyM !== undefined && point.accuracyM >= 0 ? point.accuracyM : null,
      source,
    };
  });
}

export function locationPointIdentityKey(point: NormalizedFleetTripLocationPoint): string {
  return [
    point.recordedAt.toISOString(),
    point.latitude.toFixed(7),
    point.longitude.toFixed(7),
  ].join('|');
}

export function dedupeNormalizedLocationPoints(
  points: NormalizedFleetTripLocationPoint[],
): NormalizedFleetTripLocationPoint[] {
  const seen = new Set<string>();
  const deduped: NormalizedFleetTripLocationPoint[] = [];

  for (const point of points) {
    const key = locationPointIdentityKey(point);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(point);
  }

  return deduped;
}
