import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { fleetTripApi } from '@/api/endpoints';
import {
  FLUSH_BATCH_SIZE,
  FLUSH_INTERVAL_MS,
  GPS_DISTANCE_INTERVAL_M,
  GPS_TIME_INTERVAL_MS,
  MAX_FLUSH_BACKOFF_MS,
} from './constants';
import {
  countQueuedPoints,
  deleteQueuedPoints,
  enqueueTripLocationPoint,
  peekQueuedPoints,
} from './trip-location-queue';
import { haversineDistanceKm, metersPerSecondToKmh } from './trip-stats.util';

type TripTrackingListeners = {
  onPointQueued?: (payload: { tripId: string; queuedCount: number }) => void;
  onFlushSuccess?: (payload: { tripId: string; inserted: number; queuedCount: number }) => void;
  onFlushError?: (message: string) => void;
  onWatcherActiveChange?: (active: boolean) => void;
  onLiveStats?: (payload: {
    distanceKm: number;
    currentSpeedKmh: number | null;
    lastRecordedAt: string | null;
  }) => void;
};

let activeTripId: string | null = null;
let watchSubscription: Location.LocationSubscription | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushBackoffMs = 0;
let lastFlushAttemptAt = 0;
let listeners: TripTrackingListeners = {};
let sessionDistanceKm = 0;
let lastAcceptedPoint: { lat: number; lng: number } | null = null;
let lastSpeedKmh: number | null = null;
let lastRecordedAt: string | null = null;

export function setTripTrackingListeners(next: TripTrackingListeners) {
  listeners = next;
}

export function getActiveTripTrackingId() {
  return activeTripId;
}

export function isTripLocationWatcherActive() {
  return watchSubscription !== null;
}

export async function requestTripLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === Location.PermissionStatus.GRANTED) {
    return true;
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.status === Location.PermissionStatus.GRANTED;
}

export async function startTripLocationTracking(tripId: string) {
  if (Platform.OS === 'web') {
    return;
  }

  const permissionGranted = await requestTripLocationPermission();
  if (!permissionGranted) {
    throw new Error('Location permission denied.');
  }

  activeTripId = tripId;
  sessionDistanceKm = 0;
  lastAcceptedPoint = null;
  lastSpeedKmh = null;
  lastRecordedAt = null;
  flushBackoffMs = 0;

  await stopTripLocationWatcher(false);
  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: GPS_TIME_INTERVAL_MS,
      distanceInterval: GPS_DISTANCE_INTERVAL_M,
    },
    (location) => {
      void handleTripLocationUpdate(location);
    },
  );
  listeners.onWatcherActiveChange?.(true);

  if (flushTimer) {
    clearInterval(flushTimer);
  }
  flushTimer = setInterval(() => {
    void flushActiveTripQueue(false);
  }, FLUSH_INTERVAL_MS);

  void flushActiveTripQueue(true);
}

export async function stopTripLocationTracking(options?: { flushRemaining?: boolean }) {
  const tripId = activeTripId;
  activeTripId = null;

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  await stopTripLocationWatcher(true);

  if (options?.flushRemaining !== false && tripId) {
    await flushTripQueue(tripId, true);
  }
}

async function stopTripLocationWatcher(resetSession: boolean) {
  watchSubscription?.remove();
  watchSubscription = null;
  listeners.onWatcherActiveChange?.(false);

  if (resetSession) {
    sessionDistanceKm = 0;
    lastAcceptedPoint = null;
    lastSpeedKmh = null;
    lastRecordedAt = null;
    flushBackoffMs = 0;
  }
}

async function handleTripLocationUpdate(location: Location.LocationObject) {
  if (!activeTripId) {
    return;
  }

  const lat = location.coords.latitude;
  const lng = location.coords.longitude;
  const recordedAt = new Date(location.timestamp).toISOString();
  const speedKmh = metersPerSecondToKmh(location.coords.speed);
  const heading =
    location.coords.heading !== null && location.coords.heading >= 0
      ? location.coords.heading
      : null;
  const accuracyM =
    location.coords.accuracy !== null && location.coords.accuracy >= 0
      ? location.coords.accuracy
      : null;

  if (lastAcceptedPoint) {
    sessionDistanceKm += haversineDistanceKm(
      lastAcceptedPoint.lat,
      lastAcceptedPoint.lng,
      lat,
      lng,
    );
  }
  lastAcceptedPoint = { lat, lng };
  lastSpeedKmh = speedKmh;
  lastRecordedAt = recordedAt;

  await enqueueTripLocationPoint({
    tripId: activeTripId,
    recordedAt,
    lat,
    lng,
    speedKmh,
    heading,
    accuracyM,
  });

  const queuedCount = await countQueuedPoints(activeTripId);
  listeners.onPointQueued?.({ tripId: activeTripId, queuedCount });
  listeners.onLiveStats?.({
    distanceKm: sessionDistanceKm,
    currentSpeedKmh: speedKmh,
    lastRecordedAt: recordedAt,
  });

  if (queuedCount >= FLUSH_BATCH_SIZE) {
    void flushActiveTripQueue(true);
  }
}

async function flushActiveTripQueue(force: boolean) {
  if (!activeTripId) {
    return;
  }
  await flushTripQueue(activeTripId, force);
}

export async function flushTripQueue(tripId: string, force = false) {
  const now = Date.now();
  if (!force && flushBackoffMs > 0 && now - lastFlushAttemptAt < flushBackoffMs) {
    return;
  }

  lastFlushAttemptAt = now;
  const batch = await peekQueuedPoints(tripId, FLUSH_BATCH_SIZE);
  if (batch.length === 0) {
    return;
  }

  try {
    const response = await fleetTripApi.appendLocations(
      tripId,
      batch.map((point) => ({
        recordedAt: point.recordedAt,
        lat: point.lat,
        lng: point.lng,
        ...(point.speedKmh !== null ? { speedKmh: point.speedKmh } : {}),
        ...(point.heading !== null ? { heading: point.heading } : {}),
        ...(point.accuracyM !== null ? { accuracyM: point.accuracyM } : {}),
      })),
    );

    await deleteQueuedPoints(batch.map((point) => point.id));
    flushBackoffMs = 0;

    const queuedCount = await countQueuedPoints(tripId);
    listeners.onFlushSuccess?.({
      tripId,
      inserted: response.inserted,
      queuedCount,
    });
  } catch (error) {
    flushBackoffMs = Math.min(
      flushBackoffMs > 0 ? flushBackoffMs * 2 : FLUSH_INTERVAL_MS,
      MAX_FLUSH_BACKOFF_MS,
    );
    listeners.onFlushError?.(
      error instanceof Error ? error.message : 'Failed to upload trip locations.',
    );
  }
}

export function getLiveTripStats() {
  return {
    distanceKm: sessionDistanceKm,
    currentSpeedKmh: lastSpeedKmh,
    lastRecordedAt,
  };
}
