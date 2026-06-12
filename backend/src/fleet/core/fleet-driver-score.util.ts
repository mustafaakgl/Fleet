import type { FleetDrivingEventType } from '@prisma/client';
import type { FleetTripProcessingConfig } from './fleet-trip-processing.config';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';
import type { DetectedDrivingEvent } from './fleet-driving-events.util';
import type { FleetTripProcessingResult } from './fleet-trip-processing.util';

export type FleetEventCounts = Record<FleetDrivingEventType, number>;

export function countDrivingEvents(events: DetectedDrivingEvent[]): FleetEventCounts {
  return countEventsByType(events.map((event) => ({ type: event.type })));
}

export function countEventsByType(
  events: Array<{ type: FleetDrivingEventType }>,
): FleetEventCounts {
  return {
    speeding: events.filter((event) => event.type === 'speeding').length,
    harsh_accel: events.filter((event) => event.type === 'harsh_accel').length,
    harsh_brake: events.filter((event) => event.type === 'harsh_brake').length,
  };
}

export function computeTripScore(
  metrics: FleetTripProcessingResult,
  events: DetectedDrivingEvent[],
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): number {
  const distanceKm = Math.max(metrics.distanceKm, 0.001);
  const per100Km = (count: number) => (count / distanceKm) * 100;
  const counts = countDrivingEvents(events);

  let score = config.scoreBase;
  score -= config.scoreSpeedingPer100Km * per100Km(counts.speeding);
  score -= config.scoreHarshBrakePer100Km * per100Km(counts.harsh_brake);
  score -= config.scoreHarshAccelPer100Km * per100Km(counts.harsh_accel);

  const idleRatio = metrics.durationS > 0 ? metrics.idleS / metrics.durationS : 0;
  if (idleRatio > config.scoreIdleRatioThreshold) {
    score -= config.scoreIdlePenalty;
  }

  return Number(Math.max(0, Math.min(config.scoreBase, score)).toFixed(2));
}

export type DriverScoreTripInput = {
  distanceKm: number;
  durationS: number;
  idleS: number;
  events: FleetEventCounts;
};

export function computeDriverScoreFromTrips(
  trips: DriverScoreTripInput[],
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): number {
  if (trips.length === 0) {
    return config.scoreBase;
  }

  const totals = trips.reduce(
    (acc, trip) => ({
      distanceKm: acc.distanceKm + trip.distanceKm,
      durationS: acc.durationS + trip.durationS,
      idleS: acc.idleS + trip.idleS,
      speeding: acc.speeding + trip.events.speeding,
      harsh_accel: acc.harsh_accel + trip.events.harsh_accel,
      harsh_brake: acc.harsh_brake + trip.events.harsh_brake,
    }),
    {
      distanceKm: 0,
      durationS: 0,
      idleS: 0,
      speeding: 0,
      harsh_accel: 0,
      harsh_brake: 0,
    },
  );

  const distanceKm = Math.max(totals.distanceKm, 0.001);
  const per100Km = (count: number) => (count / distanceKm) * 100;

  let score = config.scoreBase;
  score -= config.scoreSpeedingPer100Km * per100Km(totals.speeding);
  score -= config.scoreHarshBrakePer100Km * per100Km(totals.harsh_brake);
  score -= config.scoreHarshAccelPer100Km * per100Km(totals.harsh_accel);

  const idleRatio = totals.durationS > 0 ? totals.idleS / totals.durationS : 0;
  if (idleRatio > config.scoreIdleRatioThreshold) {
    score -= config.scoreIdlePenalty;
  }

  return Number(Math.max(0, Math.min(config.scoreBase, score)).toFixed(2));
}
