export type FuelEntryForConsumption = {
  id: string;
  enteredAt: Date;
  liters: number;
  totalCost: number;
  odometerKm: number | null;
  isFullTank: boolean;
};

export type TripDistanceSlice = {
  startedAt: Date;
  endedAt: Date | null;
  distanceKm: number | null;
};

export type FuelConsumptionInterval = {
  startEntryId: string;
  endEntryId: string;
  startAt: string;
  endAt: string;
  litersTotal: number;
  costTotal: number;
  distanceKm: number;
  litersPer100Km: number;
  distanceSource: 'odometer' | 'gps';
};

export function computeFuelConsumptionIntervals(
  entries: FuelEntryForConsumption[],
  trips: TripDistanceSlice[],
): FuelConsumptionInterval[] {
  const sortedEntries = [...entries].sort(
    (left, right) => left.enteredAt.getTime() - right.enteredAt.getTime(),
  );
  const fullTankEntries = sortedEntries.filter((entry) => entry.isFullTank);
  const intervals: FuelConsumptionInterval[] = [];

  for (let index = 1; index < fullTankEntries.length; index += 1) {
    const startEntry = fullTankEntries[index - 1];
    const endEntry = fullTankEntries[index];
    const intervalEntries = sortedEntries.filter(
      (entry) =>
        entry.enteredAt.getTime() > startEntry.enteredAt.getTime() &&
        entry.enteredAt.getTime() <= endEntry.enteredAt.getTime(),
    );

    const litersTotal = intervalEntries.reduce((sum, entry) => sum + entry.liters, 0);
    const costTotal = intervalEntries.reduce((sum, entry) => sum + entry.totalCost, 0);
    const distance = resolveIntervalDistanceKm(startEntry, endEntry, trips, intervalEntries);

    if (distance <= 0 || litersTotal <= 0) {
      continue;
    }

    intervals.push({
      startEntryId: startEntry.id,
      endEntryId: endEntry.id,
      startAt: startEntry.enteredAt.toISOString(),
      endAt: endEntry.enteredAt.toISOString(),
      litersTotal: round(litersTotal, 3),
      costTotal: round(costTotal, 2),
      distanceKm: round(distance, 3),
      litersPer100Km: round((litersTotal / distance) * 100, 2),
      distanceSource: resolveDistanceSource(startEntry, endEntry),
    });
  }

  return intervals;
}

export function computeWeightedAverageLitersPer100Km(
  intervals: FuelConsumptionInterval[],
): number | null {
  if (intervals.length === 0) {
    return null;
  }

  const totalDistanceKm = intervals.reduce((sum, interval) => sum + interval.distanceKm, 0);
  if (totalDistanceKm <= 0) {
    return null;
  }

  const weightedLiters = intervals.reduce(
    (sum, interval) => sum + interval.litersPer100Km * interval.distanceKm,
    0,
  );

  return round(weightedLiters / totalDistanceKm, 2);
}

function resolveIntervalDistanceKm(
  startEntry: FuelEntryForConsumption,
  endEntry: FuelEntryForConsumption,
  trips: TripDistanceSlice[],
  intervalEntries: FuelEntryForConsumption[],
): number {
  const odometerDistance = resolveOdometerDistanceKm(startEntry, endEntry, intervalEntries);
  if (odometerDistance != null && odometerDistance > 0) {
    return odometerDistance;
  }

  return sumTripDistanceKm(trips, startEntry.enteredAt, endEntry.enteredAt);
}

function resolveOdometerDistanceKm(
  startEntry: FuelEntryForConsumption,
  endEntry: FuelEntryForConsumption,
  intervalEntries: FuelEntryForConsumption[],
): number | null {
  if (
    startEntry.odometerKm != null &&
    endEntry.odometerKm != null &&
    endEntry.odometerKm > startEntry.odometerKm
  ) {
    return endEntry.odometerKm - startEntry.odometerKm;
  }

  const odometerReadings = intervalEntries
    .map((entry) => entry.odometerKm)
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);

  if (startEntry.odometerKm != null && odometerReadings.length > 0) {
    const maxReading = Math.max(endEntry.odometerKm ?? 0, ...odometerReadings);
    if (maxReading > startEntry.odometerKm) {
      return maxReading - startEntry.odometerKm;
    }
  }

  return null;
}

function resolveDistanceSource(
  startEntry: FuelEntryForConsumption,
  endEntry: FuelEntryForConsumption,
): 'odometer' | 'gps' {
  if (
    startEntry.odometerKm != null &&
    endEntry.odometerKm != null &&
    endEntry.odometerKm > startEntry.odometerKm
  ) {
    return 'odometer';
  }

  return 'gps';
}

function sumTripDistanceKm(trips: TripDistanceSlice[], from: Date, to: Date): number {
  return trips
    .filter(
      (trip) =>
        trip.endedAt &&
        trip.startedAt.getTime() >= from.getTime() &&
        trip.endedAt.getTime() <= to.getTime(),
    )
    .reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
