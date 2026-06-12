import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { fleetTripApi } from '@/api/endpoints';
import { requestForegroundLocationPermission } from '@/lib/location-tracking';
import {
  ACTIVE_TRIP_STORAGE_KEY,
  FLUSH_INTERVAL_MS,
} from './constants';
import {
  flushTripQueue,
  getLiveTripStats,
  setTripTrackingListeners,
  startTripLocationTracking,
  stopTripLocationTracking,
} from './trip-location-service';
import type { FleetTripSummary } from './types';

type FleetTripStore = {
  activeTrip: FleetTripSummary | null;
  loading: boolean;
  busy: boolean;
  queuedCount: number;
  uploadError: string | null;
  permissionDenied: boolean;
  watcherActive: boolean;
  liveDistanceKm: number;
  liveSpeedKmh: number | null;
  elapsedS: number;
  initialized: boolean;
  initialize: () => void;
  hydrateActiveTrip: () => Promise<FleetTripSummary | null>;
  startTrip: (vehicleId: string) => Promise<boolean>;
  stopTrip: () => Promise<boolean>;
  refreshActiveTrip: () => Promise<FleetTripSummary | null>;
  tickElapsed: () => void;
};

let elapsedTimer: ReturnType<typeof setInterval> | null = null;

function startElapsedTimer() {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    fleetTripStore.getState().tickElapsed();
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function computeElapsedSeconds(startedAt: string | undefined): number {
  if (!startedAt) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

export const fleetTripStore = create<FleetTripStore>((set, get) => ({
  activeTrip: null,
  loading: false,
  busy: false,
  queuedCount: 0,
  uploadError: null,
  permissionDenied: false,
  watcherActive: false,
  liveDistanceKm: 0,
  liveSpeedKmh: null,
  elapsedS: 0,
  initialized: false,

  initialize: () => {
    if (get().initialized) {
      return;
    }

    setTripTrackingListeners({
      onPointQueued: ({ queuedCount }) => {
        set({ queuedCount, uploadError: null });
      },
      onFlushSuccess: ({ queuedCount }) => {
        set({ queuedCount, uploadError: null });
      },
      onFlushError: (message) => {
        set({ uploadError: message });
      },
      onWatcherActiveChange: (active) => {
        set({ watcherActive: active });
      },
      onLiveStats: ({ distanceKm, currentSpeedKmh }) => {
        set({ liveDistanceKm: distanceKm, liveSpeedKmh: currentSpeedKmh });
      },
    });

    set({ initialized: true });
  },

  hydrateActiveTrip: async () => {
    set({ loading: true, uploadError: null });
    try {
      const storedTripId = await AsyncStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
      if (storedTripId) {
        try {
          const trip = await fleetTripApi.getById(storedTripId);
          if (trip.status === 'active') {
            set({
              activeTrip: trip,
              elapsedS: computeElapsedSeconds(trip.startedAt),
              liveDistanceKm: trip.distanceKm ? Number(trip.distanceKm) : 0,
            });
            await startTripLocationTracking(trip.id);
            startElapsedTimer();
            return trip;
          }
          await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
        } catch {
          await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
        }
      }

      const trips = await fleetTripApi.list({});
      const active = trips.find((trip) => trip.status === 'active') ?? null;
      if (active) {
        await AsyncStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, active.id);
        set({
          activeTrip: active,
          elapsedS: computeElapsedSeconds(active.startedAt),
          liveDistanceKm: active.distanceKm ? Number(active.distanceKm) : 0,
        });
        await startTripLocationTracking(active.id);
        startElapsedTimer();
        return active;
      }

      set({ activeTrip: null, elapsedS: 0, liveDistanceKm: 0, liveSpeedKmh: null });
      return null;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to load trip.',
      });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  startTrip: async (vehicleId: string) => {
    set({ busy: true, uploadError: null, permissionDenied: false });
    try {
      const permissionGranted = await requestForegroundLocationPermission();
      if (!permissionGranted) {
        set({ permissionDenied: true });
        return false;
      }

      const trip = await fleetTripApi.start({ vehicleId });
      await AsyncStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, trip.id);
      await startTripLocationTracking(trip.id);
      startElapsedTimer();

      set({
        activeTrip: trip,
        elapsedS: 0,
        liveDistanceKm: 0,
        liveSpeedKmh: null,
        queuedCount: 0,
      });
      return true;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to start trip.',
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  stopTrip: async () => {
    const trip = get().activeTrip;
    if (!trip) {
      return false;
    }

    set({ busy: true, uploadError: null });
    try {
      await stopTripLocationTracking({ flushRemaining: true });
      const closed = await fleetTripApi.stop(trip.id);
      await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
      stopElapsedTimer();

      set({
        activeTrip: null,
        watcherActive: false,
        queuedCount: 0,
        elapsedS: 0,
        liveDistanceKm: closed.distanceKm ? Number(closed.distanceKm) : get().liveDistanceKm,
        liveSpeedKmh: null,
      });
      return true;
    } catch (error) {
      const tripId = trip.id;
      await startTripLocationTracking(tripId);
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to stop trip.',
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  refreshActiveTrip: async () => {
    const trip = get().activeTrip;
    if (!trip) {
      return null;
    }

    try {
      const refreshed = await fleetTripApi.getById(trip.id);
      if (refreshed.status !== 'active') {
        await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
        await stopTripLocationTracking({ flushRemaining: false });
        stopElapsedTimer();
        set({ activeTrip: null, watcherActive: false, queuedCount: 0 });
        return refreshed;
      }

      const live = getLiveTripStats();
      set({
        activeTrip: refreshed,
        liveDistanceKm:
          refreshed.distanceKm !== null && refreshed.distanceKm !== undefined
            ? Number(refreshed.distanceKm)
            : live.distanceKm,
        liveSpeedKmh: live.currentSpeedKmh,
        elapsedS: computeElapsedSeconds(refreshed.startedAt),
      });
      return refreshed;
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : 'Failed to refresh trip.',
      });
      return trip;
    }
  },

  tickElapsed: () => {
    const trip = get().activeTrip;
    if (!trip) {
      return;
    }
    set({ elapsedS: computeElapsedSeconds(trip.startedAt) });
  },
}));

export async function flushActiveTripQueueNow() {
  const trip = fleetTripStore.getState().activeTrip;
  if (!trip) {
    return;
  }
  await flushTripQueue(trip.id, true);
}

export function getFleetTripFlushIntervalMs() {
  return FLUSH_INTERVAL_MS;
}
