import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { LocationSessionHost } from '@/components/LocationSessionHost';
import { authStore } from '@/features/auth/store';
import { messengerApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { colors } from '@/theme';

export default function AppLayout() {
  const { t } = useTranslation();
  const accessToken = authStore((s) => s.accessToken);
  const { data: unread } = useQuery({
    queryKey: ['messenger-unread-count'],
    queryFn: () => messengerApi.getUnreadCount(),
    enabled: Boolean(accessToken),
    refetchInterval: 10000,
    retry: (failureCount, error) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403
      ) {
        return false;
      }
      return failureCount < 1;
    },
  });

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  const messageBadge = unread?.total ? unread.total : undefined;

  return (
    <Fragment>
      <LocationSessionHost />
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: t('tabs.home'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          headerShown: false,
          tabBarBadge: messageBadge,
          tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('tabs.requests'),
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
    </Tabs>
    </Fragment>
  );
}
