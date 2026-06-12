export type OdometerBaselineInput = {
  initialOdometerKm: number | null;
  odometerCorrectedKm: number | null;
  odometerCorrectedAt: Date | null;
};

export type OdometerBaseline = {
  baselineKm: number;
  baselineAt: Date | null;
  source: 'correction' | 'initial' | 'none';
};

export type TripDistanceSlice = {
  startedAt: Date;
  endedAt: Date | null;
  distanceKm: number | null;
};

export function resolveOdometerBaseline(vehicle: OdometerBaselineInput): OdometerBaseline {
  if (vehicle.odometerCorrectedKm != null) {
    return {
      baselineKm: vehicle.odometerCorrectedKm,
      baselineAt: vehicle.odometerCorrectedAt,
      source: 'correction',
    };
  }

  if (vehicle.initialOdometerKm != null) {
    return {
      baselineKm: vehicle.initialOdometerKm,
      baselineAt: null,
      source: 'initial',
    };
  }

  return {
    baselineKm: 0,
    baselineAt: null,
    source: 'none',
  };
}

export function sumTripDistanceSinceBaseline(
  trips: TripDistanceSlice[],
  baseline: OdometerBaseline,
): number {
  return trips
    .filter((trip) => {
      if (!trip.endedAt || trip.distanceKm == null || trip.distanceKm <= 0) {
        return false;
      }

      if (baseline.baselineAt) {
        return trip.endedAt.getTime() >= baseline.baselineAt.getTime();
      }

      return true;
    })
    .reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0);
}

export function computeCurrentOdometerKm(
  vehicle: OdometerBaselineInput,
  trips: TripDistanceSlice[],
): {
  currentOdometerKm: number;
  gpsAccumulatedKm: number;
  baseline: OdometerBaseline;
} {
  const baseline = resolveOdometerBaseline(vehicle);
  const gpsAccumulatedKm = sumTripDistanceSinceBaseline(trips, baseline);

  return {
    currentOdometerKm: round(baseline.baselineKm + gpsAccumulatedKm, 3),
    gpsAccumulatedKm: round(gpsAccumulatedKm, 3),
    baseline,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
