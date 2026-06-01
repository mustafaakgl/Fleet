import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { messengerApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { ScreenLayout } from '@/components/ScreenLayout';
import { getErrorMessage } from '@/utils/errors';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function conversationTitle(item: {
  subject: string | null;
  driver: { firstName: string; lastName: string };
}) {
  const driverName = `${item.driver.firstName} ${item.driver.lastName}`.trim();
  return item.subject ? `${driverName} · ${item.subject}` : driverName;
}

export default function MessagesListScreen() {
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();

  const {
    data: conversations,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
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
      title="Messages"
      subtitle={`Unread total: ${unread?.total ?? 0}`}
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
      }}
    >
      {isLoading ? <LoadingState label="Loading conversations..." /> : null}

      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load conversations.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}

      {!isLoading && !error && conversations && conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          message="Your office/admin team can create a new conversation for you."
        />
      ) : null}

      {!isLoading && !error && conversations && conversations.length > 0 ? (
        <View style={styles.list}>
          {conversations.map((item) => (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => router.push(`/(app)/messages/${item.id}`)}
            >
              <View style={styles.headerRow}>
                <Text style={styles.title}>{conversationTitle(item)}</Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {item.lastMessage?.translatedText ??
                  item.lastMessage?.originalText ??
                  'No messages yet'}
              </Text>
              <Text style={styles.meta}>{formatDateTime(item.lastMessageAt)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  preview: {
    color: '#374151',
    fontSize: 13,
  },
  meta: {
    color: '#6B7280',
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 20,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
