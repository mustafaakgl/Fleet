import { create } from 'zustand';
import type { LocationStatusResponse } from '@/api/types';
import {
  enableLocationTracking,
  fetchLocationStatus,
  setLocationTrackingListeners,
  stopForegroundLocationWatcher,
  syncForegroundLocationWatcher,
} from '@/lib/location-tracking';

type LocationTrackingStore = {
  status: LocationStatusResponse | null;
  loading: boolean;
  enabling: boolean;
  lastLocalUploadAt: string | null;
  permissionDenied: boolean;
  uploadError: string | null;
  watcherActive: boolean;
  initialized: boolean;
  initialize: () => void;
  refreshStatus: () => Promise<LocationStatusResponse | null>;
  enableTracking: () => Promise<'enabled' | 'denied' | 'unsupported' | 'failed'>;
  stopTracking: () => Promise<void>;
};

export const locationTrackingStore = create<LocationTrackingStore>((set, get) => ({
  status: null,
  loading: false,
  enabling: false,
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

  enableTracking: async () => {
    set({ enabling: true, uploadError: null, permissionDenied: false });
    try {
      const result = await enableLocationTracking();
      if (result === 'denied') {
        set({ permissionDenied: true });
      }
      await get().refreshStatus();
      return result;
    } finally {
      set({ enabling: false });
    }
  },

  stopTracking: async () => {
    await stopForegroundLocationWatcher();
    set({ watcherActive: false });
  },
}));
