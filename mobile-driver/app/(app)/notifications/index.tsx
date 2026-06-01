import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const {
    data: notifications,
    isLoading: loadingNotifications,
    isRefetching,
    error: notificationsError,
    refetch,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => driverApi.listNotifications(),
  });
  const { data: unread, error: unreadError } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => driverApi.unreadNotifications(),
  });

  const markAllMutation = useMutation({
    mutationFn: () => driverApi.markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      showSuccess('All notifications marked as read.');
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to mark all notifications as read.'));
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => driverApi.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to mark notification as read.'));
    },
  });

  return (
    <ScreenLayout
      title="Notifications"
      subtitle="Read and manage your alerts"
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      }}
    >
      <View style={styles.card}>
        <Text style={styles.label}>Unread count</Text>
        <Text style={styles.value}>{unread?.count ?? 0}</Text>
      </View>
      <Pressable
        style={[styles.button, markAllMutation.isPending && styles.buttonDisabled]}
        onPress={() => markAllMutation.mutate()}
        disabled={markAllMutation.isPending}
      >
        <Text style={styles.buttonText}>{markAllMutation.isPending ? 'Updating...' : 'Mark all read'}</Text>
      </Pressable>
      {loadingNotifications ? <LoadingState label="Loading notifications..." /> : null}
      {!loadingNotifications && (notificationsError || unreadError) ? (
        <ErrorState
          message={getErrorMessage(notificationsError ?? unreadError, 'Failed to load notifications.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!loadingNotifications && !notificationsError && notifications && notifications.length === 0 ? (
        <EmptyState title="No notifications" message="You're all caught up." />
      ) : null}
      {!loadingNotifications && !notificationsError && notifications && notifications.length > 0 ? (
        <View style={styles.list}>
          {notifications.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemMessage}>{item.message}</Text>
              <Text style={styles.itemMeta}>
                {new Date(item.createdAt).toLocaleString()} - {item.status}
              </Text>
              {item.status === 'unread' ? (
                <Pressable
                  style={[styles.markButton, markOneMutation.isPending && styles.buttonDisabled]}
                  onPress={() => markOneMutation.mutate(item.id)}
                  disabled={markOneMutation.isPending}
                >
                  <Text style={styles.markButtonText}>Mark read</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
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
    gap: 4,
  },
  label: {
    color: '#4B5563',
  },
  value: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 24,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  list: {
    gap: 10,
  },
  item: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  itemTitle: {
    color: '#111827',
    fontWeight: '700',
  },
  itemMessage: {
    color: '#374151',
  },
  itemMeta: {
    color: '#6B7280',
    fontSize: 12,
  },
  markButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
