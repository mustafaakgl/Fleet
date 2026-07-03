export type TripDataPoint = {
  recordedAt: Date;
};

export type TripDataGapWindow = {
  startedAt: Date;
  endedAt: Date;
  durationS: number;
};

export function findLargestTripDataGap(points: TripDataPoint[]): TripDataGapWindow | null {
  if (points.length < 2) {
    return null;
  }

  let largestGap: TripDataGapWindow | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const durationS = Math.round((current.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000);

    if (durationS <= 0) {
      continue;
    }

    if (largestGap === null || durationS > largestGap.durationS) {
      largestGap = {
        startedAt: previous.recordedAt,
        endedAt: current.recordedAt,
        durationS,
      };
    }
  }

  return largestGap;
}