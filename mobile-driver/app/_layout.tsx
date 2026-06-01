import { Slot, SplashScreen } from 'expo-router';
import { useEffect } from 'react';
import { AppProviders } from '@/providers/AppProviders';
import { authStore } from '@/features/auth/store';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op in hot reload races
});

export default function RootLayout() {
  const hydrated = authStore((s) => s.hydrated);
  const hydrate = authStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync().catch(() => {
        // no-op
      });
    }
  }, [hydrated]);

  if (!hydrated) {
    return null;
  }

  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}
