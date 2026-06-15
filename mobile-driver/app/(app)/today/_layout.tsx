import { Stack } from 'expo-router';
import { useTranslation } from '@/i18n/useTranslation';
import { colors } from '@/theme';

export default function TodayStackLayout() {
  const { t } = useTranslation();

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
      <Stack.Screen name="license-check" />
      <Stack.Screen name="departure-check" />
      <Stack.Screen name="defects/index" />
      <Stack.Screen name="defect/[id]" />
      <Stack.Screen name="defect-report" />
      <Stack.Screen name="fines/index" options={{ title: t('fines.title') }} />
      <Stack.Screen name="fine/[id]" />
      <Stack.Screen name="trip" options={{ title: t('fleetTrip.title') }} />
      <Stack.Screen name="fuel" options={{ title: t('fleetFuel.title') }} />
      <Stack.Screen name="vehicle-status" options={{ title: t('fleetVehicle.title') }} />
    </Stack>
  );
}
