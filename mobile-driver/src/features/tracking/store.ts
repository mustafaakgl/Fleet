import { create } from 'zustand';
import type { LocationStatusResponse } from '@/api/types';
import { driverApi } from '@/api/endpoints';
import {
  grantLocationConsentOnServer,
  fetchLocationStatus,
  requestForegroundLocationPermission,
  setLocationTrackingListeners,
  stopForegroundLocationWatcher,
  syncForegroundLocationWatcher,
} from '@/lib/location-tracking';

type LocationTrackingStore = {
  status: LocationStatusResponse | null;
  loading: boolean;
  busy: boolean;
  lastLocalUploadAt: string | null;
  permissionDenied: boolean;
  uploadError: string | null;
  watcherActive: boolean;
  initialized: boolean;
  initialize: () => void;
  refreshStatus: () => Promise<LocationStatusResponse | null>;
  grantConsent: () => Promise<'granted' | 'denied' | 'unsupported' | 'failed'>;
  startSharing: () => Promise<boolean>;
  endSharing: () => Promise<boolean>;
  stopWatcher: () => Promise<void>;
  syncWatcherFromStatus: (status: LocationStatusResponse | null) => Promise<void>;
  prepareLocationConsent: () => Promise<boolean>;
  activateLocationSharing: () => Promise<boolean>;
  beginJourneyAfterCheckIn: () => Promise<boolean>;
};

export const locationTrackingStore = create<LocationTrackingStore>((set, get) => ({
  status: null,
  loading: false,
  busy: false,
  lastLocalUploadAt: null,
  permissionDenied: false,
  uploadError: null,
  watcherActive: false,
  initialized: false,

  initialize: () => {
    if (get().initialized) {
      return;
    }

    setLocationTrackingListeners({
      onLastUpload: (receivedAt) => {
        set({ lastLocalUploadAt: receivedAt, uploadError: null, permissionDenied: false });
      },
      onUploadError: (message) => {
        set({
          uploadError: message,
          permissionDenied: message.toLowerCase().includes('permission denied'),
        });
      },
      onWatcherActiveChange: (active) => {
        set({ watcherActive: active });
      },
    });

    set({ initialized: true });
  },

  refreshStatus: async () => {
    set({ loading: true });
    try {
      const status = await fetchLocationStatus();
      set({
        status,
        lastLocalUploadAt: status.lastUpload?.receivedAt ?? get().lastLocalUploadAt,
        uploadError: null,
        permissionDenied: false,
      });
      return status;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to load location status.',
      });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  grantConsent: async () => {
    set({ busy: true, uploadError: null, permissionDenied: false });
    try {
      const result = await grantLocationConsentOnServer();
      if (result === 'denied') {
        set({ permissionDenied: true });
      }
      await get().refreshStatus();
      return result;
    } finally {
      set({ busy: false });
    }
  },

  startSharing: async () => {
    set({ busy: true, uploadError: null, permissionDenied: false });
    try {
      const permissionGranted = await requestForegroundLocationPermission();
      if (!permissionGranted) {
        set({ permissionDenied: true });
        return false;
      }

      const status = await driverApi.startLocationSharing();
      set({ status });
      await get().syncWatcherFromStatus(status);
      return true;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to start location sharing.',
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  endSharing: async () => {
    set({ busy: true });
    try {
      await stopForegroundLocationWatcher();
      const status = await driverApi.endLocationSharing();
      set({ status, watcherActive: false });
      return true;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to end location sharing.',
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  stopWatcher: async () => {
    await stopForegroundLocationWatcher();
    set({ watcherActive: false });
  },

  syncWatcherFromStatus: async (status) => {
    await syncForegroundLocationWatcher(Boolean(status?.trackingAllowed));
  },

  prepareLocationConsent: async () => {
    const permissionGranted = await requestForegroundLocationPermission();
    if (!permissionGranted) {
      set({ permissionDenied: true });
      return false;
    }

    set({ permissionDenied: false });
    let current = get().status ?? (await fetchLocationStatus());
    set({ status: current });

    if (!current?.consentGranted) {
      const consentResult = await grantLocationConsentOnServer();
      if (consentResult !== 'granted') {
        return false;
      }
      current = await fetchLocationStatus();
      set({ status: current });
    }

    return true;
  },

  activateLocationSharing: async () => {
    try {
      const status = await driverApi.startLocationSharing();
      set({ status, uploadError: null });
      await syncForegroundLocationWatcher(Boolean(status.trackingAllowed));
      return Boolean(status.sharingActive);
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to start location sharing.',
      });
      return false;
    }
  },

  beginJourneyAfterCheckIn: async () => {
    set({ busy: true, uploadError: null });
    try {
      const ready = await get().prepareLocationConsent();
      if (!ready) {
        return false;
      }
      return await get().activateLocationSharing();
    } finally {
      set({ busy: false });
    }
  },
}));
