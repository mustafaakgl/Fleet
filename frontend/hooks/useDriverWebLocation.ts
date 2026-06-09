'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { driverPortalApi } from '@/lib/api';
import type { DriverLocationStatus } from '@/lib/types';

function isGeolocationSupported() {
  return typeof window !== 'undefined' && 'geolocation' in navigator;
}

async function requestBrowserLocationPermission(): Promise<boolean> {
  if (!isGeolocationSupported()) return false;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function useDriverWebLocation() {
  const [status, setStatus] = useState<DriverLocationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [watchActive, setWatchActive] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  const watchIdRef = useRef<number | null>(null);
  const nextUploadAfterSecRef = useRef(30);
  const lastUploadTsRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    const data = await driverPortalApi.getLocationStatus();
    setStatus(data);
    return data;
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatchActive(false);
  }, []);

  const uploadPosition = useCallback(async (position: GeolocationPosition) => {
    const now = Date.now();
    if (now - lastUploadTsRef.current < nextUploadAfterSecRef.current * 1000) {
      return;
    }

    const payload = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      recordedAt: new Date(position.timestamp).toISOString(),
      ...(position.coords.accuracy >= 0 ? { accuracyM: position.coords.accuracy } : {}),
      ...(position.coords.speed !== null && position.coords.speed >= 0
        ? { speedMps: position.coords.speed }
        : {}),
      ...(position.coords.heading !== null && position.coords.heading >= 0
        ? { headingDeg: position.coords.heading }
        : {}),
    };

    try {
      const response = await driverPortalApi.submitLocation(payload);
      lastUploadTsRef.current = now;
      nextUploadAfterSecRef.current = response.nextUploadAfterSec;
      setLastUploadAt(new Date().toISOString());
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload location');
    }
  }, []);

  const startWatch = useCallback(() => {
    if (!isGeolocationSupported()) {
      setUnsupported(true);
      return;
    }

    stopWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void uploadPosition(position);
      },
      () => {
        setPermissionDenied(true);
        stopWatch();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    setWatchActive(true);
    setPermissionDenied(false);
  }, [stopWatch, uploadPosition]);

  useEffect(() => {
    if (!isGeolocationSupported()) {
      setUnsupported(true);
      setLoading(false);
      return;
    }

    void refreshStatus()
      .catch((error) => {
        setUploadError(error instanceof Error ? error.message : 'Failed to load location status');
      })
      .finally(() => setLoading(false));
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.trackingAllowed && pageVisible) {
      startWatch();
      return;
    }
    stopWatch();
  }, [status?.trackingAllowed, pageVisible, startWatch, stopWatch]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const grantConsent = useCallback(async () => {
    setBusy(true);
    setUploadError(null);
    try {
      const permitted = await requestBrowserLocationPermission();
      if (!permitted) {
        setPermissionDenied(true);
        return false;
      }
      setPermissionDenied(false);
      await driverPortalApi.grantLocationConsent();
      await refreshStatus();
      return true;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to grant consent');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const startSharing = useCallback(async () => {
    setBusy(true);
    setUploadError(null);
    try {
      const permitted = await requestBrowserLocationPermission();
      if (!permitted) {
        setPermissionDenied(true);
        return false;
      }
      await driverPortalApi.startLocationSharing();
      await refreshStatus();
      return true;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to start sharing');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const endSharing = useCallback(async () => {
    setBusy(true);
    setUploadError(null);
    try {
      stopWatch();
      await driverPortalApi.endLocationSharing();
      await refreshStatus();
      return true;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to end sharing');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, stopWatch]);

  const trackingActive = Boolean(
    status?.trackingAllowed && watchActive && pageVisible && !permissionDenied,
  );

  return {
    status,
    loading,
    busy,
    permissionDenied,
    unsupported,
    lastUploadAt,
    uploadError,
    watchActive,
    pageVisible,
    trackingActive,
    refreshStatus,
    grantConsent,
    startSharing,
    endSharing,
  };
}
