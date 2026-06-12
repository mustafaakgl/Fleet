import type { FleetDrivingEventType } from '@prisma/client';
import type { FleetTripProcessingConfig } from './fleet-trip-processing.config';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';
import {
  filterPointsForProcessing,
  resolvePointSpeedKmh,
  type ProcessableTripPoint,
} from './fleet-trip-processing.util';

export type DetectedDrivingEvent = {
  type: FleetDrivingEventType;
  occurredAt: Date;
  latitude: number;
  longitude: number;
  value: number;
  threshold: number;
};

export function detectDrivingEvents(
  points: ProcessableTripPoint[],
  config: FleetTripProcessingConfig = FLEET_TRIP_PROCESSING_CONFIG,
): DetectedDrivingEvent[] {
  const filtered = filterPointsForProcessing(points, config.maxAccuracyM);
  const events: DetectedDrivingEvent[] = [];

  let speedingStartedAt: Date | null = null;
  let speedingStartPoint: ProcessableTripPoint | null = null;
  let speedingPeakKmh = 0;
  let speedingLastSeenAt: Date | null = null;

  const emitSpeedingEpisodeIfValid = () => {
    if (!speedingStartedAt || !speedingStartPoint || !speedingLastSeenAt) {
      speedingStartedAt = null;
      speedingStartPoint = null;
      speedingPeakKmh = 0;
      speedingLastSeenAt = null;
      return;
    }

    const durationSec = (speedingLastSeenAt.getTime() - speedingStartedAt.getTime()) / 1000;
    if (durationSec >= config.minSpeedingDurationSec) {
      events.push({
        type: 'speeding',
        occurredAt: speedingStartedAt,
        latitude: speedingStartPoint.latitude,
        longitude: speedingStartPoint.longitude,
        value: Number(speedingPeakKmh.toFixed(2)),
        threshold: config.speedingThresholdKmh,
      });
    }

    speedingStartedAt = null;
    speedingStartPoint = null;
    speedingPeakKmh = 0;
    speedingLastSeenAt = null;
  };

  for (let index = 0; index < filtered.length; index += 1) {
    const current = filtered[index]!;
    const previous = index > 0 ? filtered[index - 1]! : null;
    const speedKmh = resolvePointSpeedKmh(current, previous);

    if (speedKmh !== null && speedKmh > config.speedingThresholdKmh) {
      if (!speedingStartedAt) {
        speedingStartedAt = current.recordedAt;
        speedingStartPoint = current;
        speedingPeakKmh = speedKmh;
      } else {
        speedingPeakKmh = Math.max(speedingPeakKmh, speedKmh);
      }
      speedingLastSeenAt = current.recordedAt;
    } else {
      emitSpeedingEpisodeIfValid();
    }

    if (!previous || speedKmh === null) {
      continue;
    }

    const previousSpeed = resolvePointSpeedKmh(previous, index > 1 ? filtered[index - 2]! : null);
    if (previousSpeed === null) {
      continue;
    }

    const deltaMs = current.recordedAt.getTime() - previous.recordedAt.getTime();
    if (deltaMs <= 0) {
      continue;
    }

    const deltaSec = deltaMs / 1000;
    const accelerationKmhPerSec = (speedKmh - previousSpeed) / deltaSec;

    if (accelerationKmhPerSec > config.harshAccelThresholdKmhPerSec) {
      events.push({
        type: 'harsh_accel',
        occurredAt: current.recordedAt,
        latitude: current.latitude,
        longitude: current.longitude,
        value: Number(accelerationKmhPerSec.toFixed(2)),
        threshold: config.harshAccelThresholdKmhPerSec,
      });
    }

    if (accelerationKmhPerSec < -config.harshBrakeThresholdKmhPerSec) {
      events.push({
        type: 'harsh_brake',
        occurredAt: current.recordedAt,
        latitude: current.latitude,
        longitude: current.longitude,
        value: Number(Math.abs(accelerationKmhPerSec).toFixed(2)),
        threshold: config.harshBrakeThresholdKmhPerSec,
      });
    }
  }

  emitSpeedingEpisodeIfValid();

  return events;
}
