import type { FleetTripProcessingConfig } from './fleet-trip-processing.config';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';

export type TripFuelEstimateInput = {
  distanceKm: number;
  durationS: number;
  idleS: number;
  eventCount: number;
};

export function computeFuelBehaviorFactor(
  trip: TripFuelEstimateInput,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): number {
  const distanceKm = Math.max(trip.distanceKm, 0.001);
  const eventsPer100Km = (trip.eventCount / distanceKm) * 100;
  let factor = 1 + config.fuelEventFactorPer100Km * eventsPer100Km;

  const idleRatio = trip.durationS > 0 ? trip.idleS / trip.durationS : 0;
  if (idleRatio > config.scoreIdleRatioThreshold) {
    factor += config.fuelIdleRatioPenalty;
  }

  return factor;
}

export function estimateTripLiters(
  trip: TripFuelEstimateInput,
  avgConsumptionLPer100Km: number,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): number {
  if (trip.distanceKm <= 0) {
    return 0;
  }

  const consumption = avgConsumptionLPer100Km > 0
    ? avgConsumptionLPer100Km
    : config.defaultAvgConsumptionLPer100Km;

  const baseLiters = (trip.distanceKm * consumption) / 100;
  return baseLiters * computeFuelBehaviorFactor(trip, config);
}

export function estimateLitersPer100Km(
  trip: TripFuelEstimateInput,
  avgConsumptionLPer100Km: number,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): number {
  if (trip.distanceKm <= 0) {
    return 0;
  }

  return (estimateTripLiters(trip, avgConsumptionLPer100Km, config) / trip.distanceKm) * 100;
}

export function aggregateEstimatedLiters(
  trips: TripFuelEstimateInput[],
  avgConsumptionLPer100Km: number,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): {
  totalEstimatedLiters: number;
  totalDistanceKm: number;
  avgEstimatedLitersPer100Km: number | null;
} {
  const totalDistanceKm = trips.reduce((sum, trip) => sum + Math.max(trip.distanceKm, 0), 0);
  const totalEstimatedLiters = trips.reduce(
    (sum, trip) => sum + estimateTripLiters(trip, avgConsumptionLPer100Km, config),
    0,
  );

  return {
    totalEstimatedLiters: round(totalEstimatedLiters, 3),
    totalDistanceKm: round(totalDistanceKm, 3),
    avgEstimatedLitersPer100Km:
      totalDistanceKm > 0
        ? round((totalEstimatedLiters / totalDistanceKm) * 100, 2)
        : null,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
