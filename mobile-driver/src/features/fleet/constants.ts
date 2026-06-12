export const FLUSH_BATCH_SIZE = 50;
export const FLUSH_INTERVAL_MS = 30_000;
export const GPS_TIME_INTERVAL_MS = 5_000;
export const GPS_DISTANCE_INTERVAL_M = 20;
export const ACTIVE_TRIP_STORAGE_KEY = 'fleet:activeTripId';
export const MAX_FLUSH_BACKOFF_MS = 5 * 60_000;

export type QueuedTripLocationPoint = {
  id: number;
  tripId: string;
  recordedAt: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  heading: number | null;
  accuracyM: number | null;
};

export type EnqueueTripLocationInput = Omit<QueuedTripLocationPoint, 'id'>;
