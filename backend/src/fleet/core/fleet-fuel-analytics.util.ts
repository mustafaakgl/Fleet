import type { FuelConsumptionInterval } from './fleet-fuel-consumption.util';

export type WeeklyFuelTrendPoint = {
  weekStart: string;
  tripDistanceKm: number;
  realDistanceKm: number;
  realLiters: number;
  estimatedLiters: number;
  realLitersPer100Km: number | null;
  estimatedLitersPer100Km: number | null;
};

export type DriverFuelBreakdown = {
  driverId: string;
  tripDistanceKm: number;
  realLiters: number;
  estimatedLiters: number;
  eventCount: number;
  realLitersPer100Km: number | null;
  estimatedLitersPer100Km: number | null;
};

type TripEstimateRow = {
  driverId: string;
  startedAt: Date;
  distanceKm: number;
  estimatedLiters: number;
  eventCount: number;
};

type FuelEntryRow = {
  driverId: string;
  enteredAt: Date;
  liters: number;
};

export function buildWeeklyFuelTrend(
  intervals: FuelConsumptionInterval[],
  trips: TripEstimateRow[],
): WeeklyFuelTrendPoint[] {
  const buckets = new Map<string, WeeklyFuelTrendPoint>();

  for (const trip of trips) {
    const weekStart = toWeekStartIso(trip.startedAt);
    const bucket = getOrCreateBucket(buckets, weekStart);
    bucket.tripDistanceKm += trip.distanceKm;
    bucket.estimatedLiters += trip.estimatedLiters;
  }

  for (const interval of intervals) {
    const weekStart = toWeekStartIso(new Date(interval.endAt));
    const bucket = getOrCreateBucket(buckets, weekStart);
    bucket.realLiters += interval.litersTotal;
    bucket.realDistanceKm += interval.distanceKm;
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      tripDistanceKm: round(bucket.tripDistanceKm, 3),
      realDistanceKm: round(bucket.realDistanceKm, 3),
      realLiters: round(bucket.realLiters, 3),
      estimatedLiters: round(bucket.estimatedLiters, 3),
      realLitersPer100Km:
        bucket.realDistanceKm > 0 && bucket.realLiters > 0
          ? round((bucket.realLiters / bucket.realDistanceKm) * 100, 2)
          : null,
      estimatedLitersPer100Km:
        bucket.tripDistanceKm > 0 && bucket.estimatedLiters > 0
          ? round((bucket.estimatedLiters / bucket.tripDistanceKm) * 100, 2)
          : null,
    }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

export function buildDriverFuelBreakdown(
  trips: TripEstimateRow[],
  entries: FuelEntryRow[],
): DriverFuelBreakdown[] {
  const byDriver = new Map<string, DriverFuelBreakdown>();

  for (const trip of trips) {
    const row = getOrCreateDriverRow(byDriver, trip.driverId);
    row.tripDistanceKm += trip.distanceKm;
    row.estimatedLiters += trip.estimatedLiters;
    row.eventCount += trip.eventCount;
  }

  for (const entry of entries) {
    const row = getOrCreateDriverRow(byDriver, entry.driverId);
    row.realLiters += entry.liters;
  }

  return [...byDriver.values()]
    .map((row) => ({
      ...row,
      tripDistanceKm: round(row.tripDistanceKm, 3),
      realLiters: round(row.realLiters, 3),
      estimatedLiters: round(row.estimatedLiters, 3),
      realLitersPer100Km:
        row.tripDistanceKm > 0 && row.realLiters > 0
          ? round((row.realLiters / row.tripDistanceKm) * 100, 2)
          : null,
      estimatedLitersPer100Km:
        row.tripDistanceKm > 0 && row.estimatedLiters > 0
          ? round((row.estimatedLiters / row.tripDistanceKm) * 100, 2)
          : null,
    }))
    .sort((left, right) => right.tripDistanceKm - left.tripDistanceKm);
}

function getOrCreateBucket(
  buckets: Map<string, WeeklyFuelTrendPoint>,
  weekStart: string,
): WeeklyFuelTrendPoint {
  const existing = buckets.get(weekStart);
  if (existing) {
    return existing;
  }

  const created: WeeklyFuelTrendPoint = {
    weekStart,
    tripDistanceKm: 0,
    realDistanceKm: 0,
    realLiters: 0,
    estimatedLiters: 0,
    realLitersPer100Km: null,
    estimatedLitersPer100Km: null,
  };
  buckets.set(weekStart, created);
  return created;
}

function getOrCreateDriverRow(
  rows: Map<string, DriverFuelBreakdown>,
  driverId: string,
): DriverFuelBreakdown {
  const existing = rows.get(driverId);
  if (existing) {
    return existing;
  }

  const created: DriverFuelBreakdown = {
    driverId,
    tripDistanceKm: 0,
    realLiters: 0,
    estimatedLiters: 0,
    eventCount: 0,
    realLitersPer100Km: null,
    estimatedLitersPer100Km: null,
  };
  rows.set(driverId, created);
  return created;
}

function toWeekStartIso(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
