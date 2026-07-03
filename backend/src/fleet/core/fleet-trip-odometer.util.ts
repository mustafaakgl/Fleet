export type TripOdometerSnapshot = {
  odometerKm: number | null;
};

export type TripOdometerRange = {
  odoStartKm: number | null;
  odoEndKm: number | null;
};

export function deriveTripOdometerRange(
  startSnapshot: TripOdometerSnapshot | null | undefined,
  endSnapshot: TripOdometerSnapshot | null | undefined,
): TripOdometerRange {
  if (startSnapshot?.odometerKm == null || endSnapshot?.odometerKm == null) {
    return {
      odoStartKm: null,
      odoEndKm: null,
    };
  }

  if (endSnapshot.odometerKm < startSnapshot.odometerKm) {
    return {
      odoStartKm: null,
      odoEndKm: null,
    };
  }

  return {
    odoStartKm: round(startSnapshot.odometerKm, 3),
    odoEndKm: round(endSnapshot.odometerKm, 3),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}