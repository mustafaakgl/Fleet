import { Redirect, Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { authStore } from '@/features/auth/store';
import { messengerApi } from '@/api/endpoints';

export default function AppLayout() {
  const accessToken = authStore((s) => s.accessToken);
  const { data: unread } = useQuery({
    queryKey: ['messenger-unread-count'],
    queryFn: () => messengerApi.getUnreadCount(),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
  });
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: 'Fleet Driver Today' }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unread?.total ? unread.total : undefined,
        }}
      />
      <Tabs.Screen name="notifications" options={{ title: 'Fleet Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Fleet Profile' }} />
    </Tabs>
  );
}
