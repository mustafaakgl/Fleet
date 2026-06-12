import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { authStore } from '@/features/auth/store';
import {
  fleetTripStore,
  flushActiveTripQueueNow,
  getFleetTripFlushIntervalMs,
} from '@/features/fleet/store';

/** Keeps active fleet trip tracking + offline queue flush in sync while logged in. */
export function FleetTripSessionHost() {
  const accessToken = authStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken || Platform.OS === 'web') {
      return;
    }

    const store = fleetTripStore.getState();
    store.initialize();
    void store.hydrateActiveTrip();

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        void fleetTripStore.getState().hydrateActiveTrip();
        void flushActiveTripQueueNow();
      }
    };

    const flushInterval = setInterval(() => {
      void flushActiveTripQueueNow();
    }, getFleetTripFlushIntervalMs());

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
      clearInterval(flushInterval);
    };
  }, [accessToken]);

  return null;
}
