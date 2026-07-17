import { PropsWithChildren, useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { registerNotificationResponseHandler } from '@/lib/setup-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authStore } from '@/features/auth/store';
import {
  ensurePushRuntimeConfigured,
  retryPushTokenRegistrationOnForeground,
} from '@/lib/push-notifications';
import { LanguageSyncProvider } from '@/providers/LanguageSyncProvider';
import { ToastProvider } from '@/providers/ToastProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const accessToken = authStore((s) => s.accessToken);

  useEffect(() => {
    const subscription = registerNotificationResponseHandler();
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    void ensurePushRuntimeConfigured();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void retryPushTokenRegistrationOnForeground();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void retryPushTokenRegistrationOnForeground();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageSyncProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageSyncProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
