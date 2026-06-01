import { Redirect, Tabs } from 'expo-router';
import { authStore } from '@/features/auth/store';

export default function AppLayout() {
  const accessToken = authStore((s) => s.accessToken);
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
