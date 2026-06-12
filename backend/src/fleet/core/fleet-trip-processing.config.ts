export const FLEET_TRIP_PROCESSING_CONFIG = {
  /** Points with accuracy above this are excluded from distance/idle calculations. */
  maxAccuracyM: 50,
  /** Skip haversine segments implying speed above this (GPS jumps). */
  maxSegmentSpeedKmh: 200,
  /** Speed below this counts as idle time between consecutive points. */
  idleSpeedKmh: 2,
  /** Gap between consecutive accepted points marks the trip as having a data gap. */
  dataGapThresholdMs: 5 * 60 * 1000,
  /** Active trips with no points for this long are auto-closed. */
  autoStopInactivityMs: 10 * 60 * 1000,
  /** v1 fixed speed limit threshold (km/h). */
  speedingThresholdKmh: 120,
  /** Minimum continuous duration above limit to count as a speeding event. */
  minSpeedingDurationSec: 10,
  /** Harsh acceleration: km/h change per second. */
  harshAccelThresholdKmhPerSec: 12,
  /** Harsh braking: km/h drop per second (positive number). */
  harshBrakeThresholdKmhPerSec: 14,
  /** Driver score starts at 100 and subtracts penalties normalized per 100 km. */
  scoreBase: 100,
  scoreSpeedingPer100Km: 3,
  scoreHarshBrakePer100Km: 2,
  scoreHarshAccelPer100Km: 2,
  scoreIdleRatioThreshold: 0.15,
  scoreIdlePenalty: 5,
  /** §5-B: multiplier increment per driving event normalized per 100 km. */
  fuelEventFactorPer100Km: 0.0015,
  /** §5-B: extra multiplier when idle ratio exceeds threshold. */
  fuelIdleRatioPenalty: 0.05,
  /** Fallback when vehicle.avgConsumptionLPer100Km is unset. */
  defaultAvgConsumptionLPer100Km: 8,
} as const;

export type FleetTripProcessingConfig = typeof FLEET_TRIP_PROCESSING_CONFIG;
