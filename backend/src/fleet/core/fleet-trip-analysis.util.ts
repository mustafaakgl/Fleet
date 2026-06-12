import type { FleetTripProcessingConfig } from './fleet-trip-processing.config';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';
import { detectDrivingEvents, type DetectedDrivingEvent } from './fleet-driving-events.util';
import { computeTripScore } from './fleet-driver-score.util';
import {
  computeTripMetrics,
  type FleetTripProcessingResult,
  type ProcessableTripPoint,
} from './fleet-trip-processing.util';

export type FleetTripAnalysis = {
  metrics: FleetTripProcessingResult;
  events: DetectedDrivingEvent[];
  score: number;
};

export function analyzeTripPoints(
  points: ProcessableTripPoint[],
  tripStartedAt: Date,
  tripEndedAt: Date,
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): FleetTripAnalysis {
  const metrics = computeTripMetrics(points, tripStartedAt, tripEndedAt, config);
  const events = detectDrivingEvents(points, config);
  const score = computeTripScore(metrics, events, config);

  return { metrics, events, score };
}
