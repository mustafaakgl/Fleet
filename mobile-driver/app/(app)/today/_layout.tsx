import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function TodayStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="assignment/[id]" />
      <Stack.Screen name="morning-checkin" />
      <Stack.Screen name="handover-upload" />
      <Stack.Screen name="accident-report" />
      <Stack.Screen name="cargo-damage-report" />
      <Stack.Screen name="leave-request" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
