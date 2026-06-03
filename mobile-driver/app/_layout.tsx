import 'react-native-gesture-handler';
import { Slot, SplashScreen } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppProviders } from '@/providers/AppProviders';
import { authStore } from '@/features/auth/store';
import { colors } from '@/theme';

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
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
