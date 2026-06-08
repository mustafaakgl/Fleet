import { Redirect, Tabs, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Fragment, StyleSheet, View } from 'react-native';
import { LocationSessionHost } from '@/components/LocationSessionHost';
import { WorkSessionHost } from '@/components/WorkSessionHost';
import { authStore } from '@/features/auth/store';
import { driverApi, messengerApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { colors } from '@/theme';

export default function AppLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const accessToken = authStore((s) => s.accessToken);
  const onDocumentOnboarding = segments.includes('document-onboarding');

  const { data: documents, isLoading: documentsLoading, isError: documentsError } = useQuery({
    queryKey: ['driver-documents'],
    queryFn: () => driverApi.listDocuments(),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 2,
  });

  const documentsIncomplete =
    Boolean(accessToken) &&
    !documentsLoading &&
    (documentsError ||
      !documents ||
      (documents.missingUploadableRequired?.length ?? documents.missingRequired.length) > 0);

  const { data: unread } = useQuery({
    queryKey: ['messenger-unread-count'],
    queryFn: () => messengerApi.getUnreadCount(),
    enabled: Boolean(accessToken) && !documentsIncomplete,
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

  if (documentsLoading && !onDocumentOnboarding) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (documentsIncomplete && !onDocumentOnboarding) {
    return <Redirect href="/(app)/document-onboarding" />;
  }

  const messageBadge = unread?.total ? unread.total : undefined;

  return (
    <Fragment>
      {!documentsIncomplete ? <LocationSessionHost /> : null}
      {!documentsIncomplete ? <WorkSessionHost /> : null}
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle:
          onDocumentOnboarding || documentsIncomplete
            ? { display: 'none' }
            : {
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
          tabBarLabel: t('tabs.home'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarLabel: t('tabs.messages'),
          headerShown: false,
          tabBarBadge: messageBadge,
          tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('tabs.requests'),
          tabBarLabel: t('tabs.requests'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarLabel: t('tabs.profile'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="document-onboarding" options={{ href: null, headerShown: false }} />
    </Tabs>
    </Fragment>
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
