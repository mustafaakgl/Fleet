import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';

export default function ProfileSettingsScreen() {
  const clearSession = authStore((s) => s.clearSession);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(auth)/login');
  };

  return (
    <ScreenLayout title="Profile / Settings" subtitle="Driver account and app settings">
      {isLoading ? <LoadingState label="Loading profile..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load profile.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && data ? (
        <View style={styles.card}>
          <Text style={styles.row}>Name: {`${data.driver.firstName} ${data.driver.lastName}`}</Text>
          <Text style={styles.row}>Email: {data.driver.email ?? data.user.email ?? '-'}</Text>
          <Text style={styles.row}>Phone: {data.driver.phone ?? '-'}</Text>
          <Text style={styles.row}>Status: {data.driver.status}</Text>
          <Text style={styles.row}>Language: {data.user.language ?? '-'}</Text>
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={() => void handleLogout()}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  row: {
    color: '#111827',
  },
  button: {
    backgroundColor: '#B91C1C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
