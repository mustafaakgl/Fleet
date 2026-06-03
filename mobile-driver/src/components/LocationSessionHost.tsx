import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { authStore } from '@/features/auth/store';
import { locationTrackingStore } from '@/features/tracking/store';

/**
 * Keeps foreground GPS watcher in sync with server session while the driver is logged in.
 * Watcher is not stopped on tab changes — only when the driver ends the journey or logs out.
 */
export function LocationSessionHost() {
  const accessToken = authStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const store = locationTrackingStore.getState();
    store.initialize();

    const syncFromServer = async () => {
      const status = await store.refreshStatus();
      await store.syncWatcherFromStatus(status);
    };

    void syncFromServer();

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        void syncFromServer();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [accessToken]);

  return null;
}
