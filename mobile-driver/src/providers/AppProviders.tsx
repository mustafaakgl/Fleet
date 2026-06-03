import { PropsWithChildren, useEffect, useMemo } from 'react';
import { registerNotificationResponseHandler } from '@/lib/setup-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/providers/ToastProvider';

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    const subscription = registerNotificationResponseHandler();
    return () => {
      subscription.remove();
    };
  }, []);

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
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
