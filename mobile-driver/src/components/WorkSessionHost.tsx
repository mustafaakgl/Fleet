import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { authStore } from '@/features/auth/store';
import { driverApi } from '@/api/endpoints';

/**
 * Starts a work session when the driver opens the app and ends it on background (Feierabend).
 */
export function WorkSessionHost() {
  const accessToken = authStore((state) => state.accessToken);
  const backgroundEndedRef = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void driverApi.startWorkSession().catch(() => {
      // offline or already active — ignore
    });

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (backgroundEndedRef.current) {
          return;
        }
        backgroundEndedRef.current = true;
        void driverApi.endWorkSession('app_background').catch(() => {
          backgroundEndedRef.current = false;
        });
        return;
      }

      if (next === 'active') {
        backgroundEndedRef.current = false;
        void driverApi.startWorkSession().catch(() => {
          // ignore
        });
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [accessToken]);

  return null;
}
