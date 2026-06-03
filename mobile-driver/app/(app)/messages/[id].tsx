import { useCallback, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messengerApi, driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { MessageBubble } from '@/components/MessageBubble';
import type { MessengerLanguage } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError } from '@/utils/feedback';
import { handleMessengerForbidden } from '@/utils/messenger-errors';

function conversationTitle(item: {
  subject: string | null;
  driver: { firstName: string; lastName: string };
}) {
  const driverName = `${item.driver.firstName} ${item.driver.lastName}`.trim();
  return item.subject ? item.subject : driverName;
}

export default function MessageThreadScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const sessionUserId = authStore((s) => s.session?.user.id);
  const sessionLanguage = authStore((s) => s.session?.user.language);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof messengerApi.listMessages>>>([]);
  const [messageText, setMessageText] = useState('');

  const { data: driverMe } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });

  const {
    data: conversation,
    isLoading: loadingConversation,
    error: conversationError,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: ['messenger-conversation-detail', conversationId],
    queryFn: async () => messengerApi.getConversation(conversationId),
    enabled: Boolean(conversationId),
  });

  const {
    isLoading: loadingMessages,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['messenger-conversation-messages', conversationId],
    queryFn: async () => {
      const list = await messengerApi.listMessages(conversationId, { limit: 50 });
      setMessages(list);
      return list;
    },
    enabled: Boolean(conversationId),
  });

  const pollIncremental = useCallback(async () => {
    if (!conversationId) return;
    try {
      const last = messages[messages.length - 1];
      const incremental = await messengerApi.listMessages(conversationId, {
        since: last?.createdAt,
        afterId: last?.id,
        limit: 50,
      });
      if (incremental.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const row of incremental) {
            if (!seen.has(row.id)) {
              merged.push(row);
            }
          }
          return merged;
        });
        await messengerApi.markConversationRead(conversationId);
        await queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
        await queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
      }
    } catch (error) {
      handleMessengerForbidden(error, t('messages.accessDenied'));
    }
  }, [conversationId, messages, queryClient, t]);

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      void messengerApi
        .markConversationRead(conversationId)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
        })
        .catch((error) => {
          handleMessengerForbidden(error, t('messages.accessDenied'));
        });

      const interval = setInterval(() => {
        void pollIncremental();
      }, 10000);

      return () => clearInterval(interval);
    }, [conversationId, pollIncremental, queryClient, t]),
  );

  const sendMutation = useMutation({
    mutationFn: (payload: { text: string; originalLanguage: MessengerLanguage }) =>
      messengerApi.sendMessage(conversationId, {
        text: payload.text,
        originalLanguage: payload.originalLanguage,
      }),
    onSuccess: async (created) => {
      setMessages((prev) => [...prev, created]);
      setMessageText('');
      await queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
    },
    onError: (error) => {
      if (handleMessengerForbidden(error, t('messages.accessDenied'))) return;
      showError(getErrorMessage(error, t('messages.sendFailed')));
    },
  });

  const myUserId = sessionUserId ?? conversation?.participants.find((row) => row.role === 'driver')?.userId;

  const handleSend = () => {
    if (!conversationId) {
      showError(t('messages.loadThreadError'));
      return;
    }
    const text = messageText.trim();
    if (!text) return;
    const language = (driverMe?.user?.language ?? sessionLanguage ?? 'tr') as MessengerLanguage;
    sendMutation.mutate({ text, originalLanguage: language });
  };

  const canSend = Boolean(messageText.trim()) && !sendMutation.isPending;
  const threadReady =
    !loadingConversation && !loadingMessages && !conversationError && !messagesError;
  const title = conversation ? conversationTitle(conversation) : t('messages.thread');

  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.body}>
          {loadingConversation || loadingMessages ? (
            <LoadingState label={t('common.loading')} />
          ) : null}
          {!loadingConversation && !loadingMessages && (conversationError || messagesError) ? (
            <ErrorState
              message={getErrorMessage(conversationError ?? messagesError, t('messages.loadThreadError'))}
              onRetry={() => {
                void refetchConversation();
                void refetchMessages();
              }}
            />
          ) : null}
          {threadReady ? (
            <ScrollView
              style={styles.thread}
              contentContainerStyle={styles.threadContent}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={isFocused && (loadingConversation || loadingMessages)}
                  onRefresh={() => {
                    void refetchConversation();
                    void refetchMessages();
                  }}
                  tintColor={colors.accent}
                />
              }
            >
              {messages.length === 0 ? (
                <EmptyState
                  title={t('messages.noMessages')}
                  message={t('messages.noMessagesHint')}
                  icon="message-circle"
                />
              ) : (
                messages.map((item) => (
                  <MessageBubble
                    key={item.id}
                    message={item}
                    mine={item.senderUserId === myUserId}
                  />
                ))
              )}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={t('messages.typePlaceholder')}
            placeholderTextColor={colors.muted}
            value={messageText}
            onChangeText={setMessageText}
            editable={!sendMutation.isPending && Boolean(conversationId)}
            multiline
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityLabel={t('common.send')}
          >
            {sendMutation.isPending ? (
              <Text style={styles.sendLabel}>{t('common.sending')}</Text>
            ) : (
              <Feather name="send" size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: { flex: 1 },
  body: { flex: 1, minHeight: 0 },
  thread: { flex: 1 },
  threadContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  composer: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.primary,
    fontSize: 15,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.6,
  },
  sendLabel: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
});
