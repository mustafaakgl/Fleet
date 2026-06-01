import { Redirect, Tabs } from 'expo-router';
import { authStore } from '@/features/auth/store';

export default function AppLayout() {
  const accessToken = authStore((s) => s.accessToken);
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: 'Fleet Driver Today' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Fleet Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Fleet Profile' }} />
    </Tabs>
  );
}
