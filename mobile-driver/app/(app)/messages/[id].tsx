import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { messengerApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { ScreenLayout } from '@/components/ScreenLayout';
import { getErrorMessage } from '@/utils/errors';
import { showError } from '@/utils/feedback';

function formatDateTime(value: string): string {
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

export default function MessageThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof messengerApi.listMessages>>>([]);
  const [messageText, setMessageText] = useState('');

  const {
    data: conversation,
    isLoading: loadingConversation,
    error: conversationError,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: ['messenger-conversation-detail', id],
    queryFn: async () => messengerApi.getConversation(id),
    enabled: Boolean(id),
  });

  const {
    isLoading: loadingMessages,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['messenger-conversation-messages', id],
    queryFn: async () => {
      const list = await messengerApi.listMessages(id, { limit: 50 });
      setMessages(list);
      return list;
    },
    enabled: Boolean(id),
  });

  const pollIncremental = useCallback(async () => {
    if (!id) return;
    const last = messages[messages.length - 1];
    const incremental = await messengerApi.listMessages(id, {
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
      await messengerApi.markConversationRead(id);
      await queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
    }
  }, [id, messages, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return undefined;
      void messengerApi.markConversationRead(id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
      });

      const interval = setInterval(() => {
        void pollIncremental();
      }, 10000);

      return () => {
        clearInterval(interval);
      };
    }, [id, pollIncremental, queryClient]),
  );

  const sendMutation = useMutation({
    mutationFn: (payload: { text: string }) =>
      messengerApi.sendMessage(id, {
        text: payload.text,
        originalLanguage: 'tr',
        targetLanguage: 'de',
      }),
    onSuccess: async (created) => {
      setMessages((prev) => [...prev, created]);
      setMessageText('');
      await queryClient.invalidateQueries({ queryKey: ['messenger-conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['messenger-unread-count'] });
    },
    onError: (error) => {
      showError(getErrorMessage(error, 'Failed to send message.'));
    },
  });

  const myUserId = useMemo(() => {
    const participant = conversation?.participants.find((row) => row.role === 'driver');
    return participant?.userId;
  }, [conversation]);

  const handleSend = () => {
    const text = messageText.trim();
    if (!text) {
      showError('Message cannot be empty.');
      return;
    }
    sendMutation.mutate({ text });
  };

  return (
    <ScreenLayout
      title="Message Thread"
      subtitle={conversation ? conversationTitle(conversation) : 'Loading conversation...'}
      refreshing={isFocused && (loadingConversation || loadingMessages)}
      onRefresh={() => {
        void refetchConversation();
        void refetchMessages();
      }}
    >
      {loadingConversation || loadingMessages ? (
        <LoadingState label="Loading messages..." />
      ) : null}

      {!loadingConversation && !loadingMessages && (conversationError || messagesError) ? (
        <ErrorState
          message={getErrorMessage(conversationError ?? messagesError, 'Failed to load message thread.')}
          onRetry={() => {
            void refetchConversation();
            void refetchMessages();
          }}
        />
      ) : null}

      {!loadingConversation && !loadingMessages && !conversationError && !messagesError ? (
        <View style={styles.threadCard}>
          <Text style={styles.participantsLabel}>
            Participants:{' '}
            {conversation?.participants.map((participant) => participant.user.fullName).join(', ')}
          </Text>
          {messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              message="Write the first message below."
            />
          ) : (
            <View style={styles.messageList}>
              {messages.map((item) => {
                const mine = item.senderUserId === myUserId;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.messageBubble,
                      mine ? styles.messageBubbleMine : styles.messageBubbleOther,
                    ]}
                  >
                    <Text style={styles.sender}>{item.senderName}</Text>
                    <Text style={styles.originalText}>{item.originalText}</Text>
                    {item.translatedText ? (
                      <Text style={styles.translatedText}>{item.translatedText}</Text>
                    ) : null}
                    {item.translationStatus === 'failed' ? (
                      <Text style={styles.translationFailed}>Translation failed</Text>
                    ) : null}
                    <Text style={styles.timestamp}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          value={messageText}
          onChangeText={setMessageText}
          editable={!sendMutation.isPending}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (sendMutation.isPending || !messageText.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sendMutation.isPending || !messageText.trim()}
        >
          <Text style={styles.sendButtonText}>
            {sendMutation.isPending ? 'Sending...' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  threadCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  participantsLabel: {
    color: '#4B5563',
    fontSize: 12,
  },
  messageList: {
    gap: 8,
  },
  messageBubble: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
    maxWidth: '90%',
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  sender: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  originalText: {
    color: '#111827',
    fontSize: 14,
  },
  translatedText: {
    color: '#4B5563',
    fontSize: 13,
  },
  translationFailed: {
    color: '#B45309',
    fontSize: 12,
  },
  timestamp: {
    color: '#6B7280',
    fontSize: 11,
  },
  composer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
