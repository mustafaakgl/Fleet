import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { ActionButton } from '@/components/ActionButton';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { Card } from '@/components/ui/Card';

export default function NotificationsScreen() {
  const { t } = useTranslation();
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
      showSuccess(t('notifications.markAll'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to mark notifications.'));
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => driverApi.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to mark notification.'));
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: t('notifications.title') }} />
      <ScreenLayout
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
        }}
      >
        <Card>
          <Text style={styles.label}>{t('common.unread')}</Text>
          <Text style={styles.value}>{unread?.count ?? 0}</Text>
        </Card>
        <ActionButton
          label={markAllMutation.isPending ? t('common.loading') : t('notifications.markAll')}
          onPress={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending}
          variant="primary"
        />
        {loadingNotifications ? <LoadingState label={t('common.loading')} /> : null}
        {!loadingNotifications && (notificationsError || unreadError) ? (
          <ErrorState
            message={getErrorMessage(notificationsError ?? unreadError, 'Failed to load notifications.')}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}
        {!loadingNotifications && !notificationsError && notifications && notifications.length === 0 ? (
          <EmptyState title={t('notifications.empty')} message={t('notifications.emptyHint')} icon="bell" />
        ) : null}
        {!loadingNotifications && !notificationsError && notifications && notifications.length > 0 ? (
          <View style={styles.list}>
            {notifications.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.item, item.status === 'unread' && styles.itemUnread]}
                onPress={() => {
                  if (item.relatedEntityType === 'conversation' && item.relatedEntityId) {
                    router.push(`/(app)/messages/${item.relatedEntityId}`);
                    return;
                  }
                  if (item.relatedEntityType === 'assignment' && item.relatedEntityId) {
                    router.push(`/(app)/today/assignment/${item.relatedEntityId}`);
                    return;
                  }
                  if (
                    item.relatedEntityType === 'request' ||
                    item.relatedEntityType === 'transport_request'
                  ) {
                    router.push('/(app)/requests');
                  }
                }}
              >
                <View style={styles.row}>
                  <Feather
                    name={item.status === 'unread' ? 'bell' : 'check-circle'}
                    size={18}
                    color={item.status === 'unread' ? colors.accent : colors.success}
                  />
                  <Text style={styles.itemTitle}>{item.title}</Text>
                </View>
                <Text style={styles.itemMessage}>{item.message}</Text>
                <Text style={styles.itemMeta}>
                  {new Date(item.createdAt).toLocaleString()} · {item.status}
                </Text>
                {item.status === 'unread' ? (
                  <Pressable
                    style={[styles.markButton, markOneMutation.isPending && styles.buttonDisabled]}
                    onPress={() => markOneMutation.mutate(item.id)}
                    disabled={markOneMutation.isPending}
                  >
                    <Text style={styles.markButtonText}>{t('notifications.markOne')}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, textTransform: 'none' },
  value: { ...typography.h1, fontSize: 28 },
  buttonDisabled: { opacity: 0.6 },
  list: { gap: spacing.sm },
  item: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.sm,
  },
  itemUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTitle: { ...typography.bodyMedium, color: colors.primary, flex: 1 },
  itemMessage: { color: colors.subtext, fontSize: 14, lineHeight: 20 },
  itemMeta: { color: colors.muted, fontSize: 12 },
  markButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  markButtonText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
});
