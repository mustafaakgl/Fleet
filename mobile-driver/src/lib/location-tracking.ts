import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { driverApi } from '@/api/endpoints';
import type { LocationStatusResponse, SubmitLocationPayload } from '@/api/types';

const DEFAULT_UPLOAD_INTERVAL_SEC = 30;

let watchSubscription: Location.LocationSubscription | null = null;
let nextUploadAfterSec = DEFAULT_UPLOAD_INTERVAL_SEC;
let lastUploadTimestamp = 0;
let uploadError: string | null = null;
let hasReportedUploadError = false;

type LocationUpdateListeners = {
  onLastUpload?: (receivedAt: string) => void;
  onUploadError?: (message: string) => void;
  onWatcherActiveChange?: (active: boolean) => void;
};

let listeners: LocationUpdateListeners = {};

export function setLocationTrackingListeners(next: LocationUpdateListeners) {
  listeners = next;
}

export function getLocationUploadError() {
  return uploadError;
}

export function isForegroundLocationWatcherActive() {
  return watchSubscription !== null;
}

export async function fetchLocationStatus(): Promise<LocationStatusResponse> {
  return driverApi.getLocationStatus();
}

export async function requestForegroundLocationPermission(): Promise<boolean> {
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

export async function enableLocationTracking(): Promise<'enabled' | 'denied' | 'unsupported' | 'failed'> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const permissionGranted = await requestForegroundLocationPermission();
  if (!permissionGranted) {
    uploadError = 'Location permission denied.';
    listeners.onUploadError?.(uploadError);
    return 'denied';
  }

  try {
    await driverApi.grantLocationConsent();
    return 'enabled';
  } catch (error) {
    uploadError = error instanceof Error ? error.message : 'Failed to enable location tracking.';
    if (!hasReportedUploadError) {
      hasReportedUploadError = true;
      listeners.onUploadError?.(uploadError);
    }
    return 'failed';
  }
}

export async function syncForegroundLocationWatcher(trackingAllowed: boolean) {
  if (Platform.OS === 'web' || !trackingAllowed) {
    await stopForegroundLocationWatcher();
    return;
  }

  const permissionGranted = await requestForegroundLocationPermission();
  if (!permissionGranted) {
    await stopForegroundLocationWatcher();
    uploadError = 'Location permission denied.';
    listeners.onUploadError?.(uploadError);
    return;
  }

  if (!watchSubscription) {
    await startForegroundLocationWatcher();
  }
}

export async function startForegroundLocationWatcher() {
  if (Platform.OS === 'web') {
    return;
  }

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return;
  }

  await stopForegroundLocationWatcher(false);

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      distanceInterval: 50,
    },
    (location) => {
      void handleLocationUpdate(location);
    },
  );

  listeners.onWatcherActiveChange?.(true);
}

export async function stopForegroundLocationWatcher(resetUploadState = true) {
  watchSubscription?.remove();
  watchSubscription = null;
  listeners.onWatcherActiveChange?.(false);

  if (resetUploadState) {
    nextUploadAfterSec = DEFAULT_UPLOAD_INTERVAL_SEC;
    lastUploadTimestamp = 0;
    uploadError = null;
    hasReportedUploadError = false;
  }
}

async function handleLocationUpdate(location: Location.LocationObject) {
  const now = Date.now();
  if (now - lastUploadTimestamp < nextUploadAfterSec * 1000) {
    return;
  }

  const speed = location.coords.speed;
  const heading = location.coords.heading;

  const payload: SubmitLocationPayload = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    recordedAt: new Date(location.timestamp).toISOString(),
  };

  if (location.coords.accuracy !== null && location.coords.accuracy >= 0) {
    payload.accuracyM = location.coords.accuracy;
  }
  if (speed !== null && speed >= 0) {
    payload.speedMps = speed;
  }
  if (heading !== null && heading >= 0) {
    payload.headingDeg = heading;
  }
  if (location.coords.altitude !== null) {
    payload.altitudeM = location.coords.altitude;
  }

  try {
    const response = await driverApi.submitLocation(payload);
    lastUploadTimestamp = now;
    nextUploadAfterSec = response.nextUploadAfterSec;
    uploadError = null;
    hasReportedUploadError = false;
    listeners.onLastUpload?.(new Date().toISOString());
  } catch (error) {
    uploadError = error instanceof Error ? error.message : 'Failed to upload location.';
    if (!hasReportedUploadError) {
      hasReportedUploadError = true;
      listeners.onUploadError?.(uploadError);
    }
  }
}

export function formatLocationTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
