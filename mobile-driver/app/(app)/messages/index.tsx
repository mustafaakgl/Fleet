import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { messengerApi } from '@/api/endpoints';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonCard } from '@/components/Skeleton';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

function conversationTitle(item: {
  subject: string | null;
  driver: { firstName: string; lastName: string };
}) {
  const driverName = `${item.driver.firstName} ${item.driver.lastName}`.trim();
  return item.subject ? `${item.subject}` : driverName;
}

function previewText(item: {
  lastMessage?: { originalText: string; translatedText: string | null } | null;
}) {
  const msg = item.lastMessage;
  if (!msg) return '';
  return msg.translatedText ?? msg.originalText;
}

export default function MessagesListScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['messenger-conversations'],
    queryFn: () => messengerApi.listConversations(),
    refetchInterval: isFocused ? 10000 : false,
  });

  const { data: unread } = useQuery({
    queryKey: ['messenger-unread-count'],
    queryFn: () => messengerApi.getUnreadCount(),
    refetchInterval: isFocused ? 10000 : false,
  });

  return (
    <ScreenLayout
      title={t('messages.title')}
      subtitle={t('messages.subtitle', { count: unread?.total ?? 0 })}
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
      }}
    >
      {isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, t('messages.loadError'))}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}

      {!isLoading && !error && conversations && conversations.length === 0 ? (
        <EmptyState
          title={t('messages.emptyTitle')}
          message={t('messages.emptyMessage')}
          icon="message-circle"
        />
      ) : null}

      {!isLoading && !error && conversations && conversations.length > 0 ? (
        <View style={styles.list}>
          {conversations.map((item) => {
            const title = conversationTitle(item);
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/(app)/messages/${item.id}`)}
              >
                <Avatar name={title} size={44} />
                <View style={styles.content}>
                  <View style={styles.headerRow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.meta}>{formatDateTime(item.lastMessageAt)}</Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {previewText(item) || '—'}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  cardPressed: { backgroundColor: colors.overlay },
  content: { flex: 1, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.primary,
  },
  preview: {
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
});
