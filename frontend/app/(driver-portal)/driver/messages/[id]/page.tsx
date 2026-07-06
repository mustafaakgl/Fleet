'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessengerChatPanel, type MessengerUiMessage } from '@/components/messenger/MessengerChatPanel';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { driverPortalApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { ConversationDetail, MessengerLanguage, MessengerMessage } from '@/lib/types';

export default function DriverMessageThreadPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;
  const pollTimerRef = useRef<number | null>(null);
  const currentUser = getUser();
  const currentUserId = currentUser?.id ?? null;
  const currentUserName = currentUser?.name ?? currentUser?.email ?? 'User';

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessengerUiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState<MessengerLanguage>('de');
  const [error, setError] = useState<string | null>(null);

  const sortMessages = useCallback((items: MessengerUiMessage[]) => {
    return [...items].sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });
  }, []);

  const mergeMessages = useCallback((current: MessengerUiMessage[], incoming: MessengerMessage[]) => {
    const localOnly = current.filter((message) => message.deliveryState === 'sending' || message.deliveryState === 'error');
    const byId = new Map<string, MessengerUiMessage>();

    for (const message of incoming) {
      byId.set(message.id, { ...message, deliveryState: 'sent' });
    }
    for (const message of localOnly) {
      byId.set(message.id, message);
    }

    return sortMessages(Array.from(byId.values()));
  }, [sortMessages]);

  const loadThread = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const [detail, thread, profile] = await Promise.all([
        messengerApi.getConversation(conversationId),
        messengerApi.listMessages(conversationId, { limit: 40 }),
        driverPortalApi.me().catch(() => null),
      ]);
      setConversation(detail);
      setMessages(thread.map((message) => ({ ...message, deliveryState: 'sent' as const })));
      setHasOlderMessages(thread.length >= 40);
      setOriginalLanguage((profile?.user.language as MessengerLanguage | undefined) ?? 'de');
      await messengerApi.markConversationRead(conversationId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.messages.threadError'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!conversationId) return;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const latest = await messengerApi.listMessages(conversationId, { limit: 40 });
        setMessages((previous) => mergeMessages(previous, latest));
        await messengerApi.markConversationRead(conversationId);
        setMessages((previous) => previous.map((message) => (
          message.senderUserId === currentUserId ? message : { ...message, readByCurrentUser: true }
        )));
      } catch {
        // keep stale thread visible
      }
    };

    pollTimerRef.current = window.setInterval(() => {
      void poll();
    }, 7_500);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void poll();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [conversationId, currentUserId, mergeMessages]);

  const handleSend = useCallback(async () => {
    if (!conversationId) return;
    const text = composerText.trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: MessengerUiMessage = {
      id: tempId,
      clientId: tempId,
      conversationId,
      senderUserId: currentUserId ?? 'unknown',
      senderName: currentUserName,
      originalText: text,
      translatedText: null,
      originalLanguage,
      targetLanguage: null,
      translationStatus: 'pending',
      createdAt: new Date().toISOString(),
      readByCurrentUser: true,
      deliveryState: 'sending',
    };

    setMessages((previous) => sortMessages([...previous, optimisticMessage]));
    setComposerText('');

    try {
      const created = await messengerApi.sendMessage(conversationId, {
        text,
        originalLanguage,
      });
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== tempId).concat({ ...created, deliveryState: 'sent' })),
      );
    } catch (err) {
      setMessages((previous) => previous.map((message) => (
        message.id === tempId ? { ...message, deliveryState: 'error', translationStatus: 'failed' } : message
      )));
      setError(err instanceof Error ? err.message : t('driverPortal.messages.sendFailed'));
    }
  }, [composerText, conversationId, currentUserId, currentUserName, originalLanguage, sortMessages, t]);

  const handleRetry = useCallback(async (messageId: string) => {
    const failed = messages.find((message) => message.id === messageId);
    if (!failed || !conversationId) return;

    setMessages((previous) => previous.map((message) => (
      message.id === messageId ? { ...message, deliveryState: 'sending' } : message
    )));

    try {
      const created = await messengerApi.sendMessage(conversationId, {
        text: failed.originalText,
        originalLanguage: failed.originalLanguage,
      });
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== messageId).concat({ ...created, deliveryState: 'sent' })),
      );
    } catch (err) {
      setMessages((previous) => previous.map((message) => (
        message.id === messageId ? { ...message, deliveryState: 'error' } : message
      )));
      setError(err instanceof Error ? err.message : t('driverPortal.messages.sendFailed'));
    }
  }, [conversationId, messages, sortMessages, t]);

  const handleLoadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder) return;
    const oldestServerMessage = messages.find((message) => !message.id.startsWith('temp-'));
    if (!oldestServerMessage) return;

    setLoadingOlder(true);
    try {
      const older = await messengerApi.listMessages(conversationId, {
        beforeId: oldestServerMessage.id,
        limit: 30,
      });
      if (older.length === 0) {
        setHasOlderMessages(false);
      } else {
        setMessages((previous) =>
          sortMessages([
            ...older.map((message) => ({ ...message, deliveryState: 'sent' as const })),
            ...previous,
          ]),
        );
        setHasOlderMessages(older.length >= 30);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, messages, sortMessages]);

  const selectedConversationId = useMemo(() => conversationId ?? null, [conversationId]);

  return (
    <DriverPortalShell hideHeader hideNav>
      {error ? <p className="px-4 pt-4 text-sm text-red-600">{error}</p> : null}
      <div className="h-[100dvh] overflow-hidden bg-white">
        <MessengerChatPanel
          selectedConversationId={selectedConversationId}
          selectedConversation={conversation}
          messages={messages}
          loading={loading}
          loadingOlder={loadingOlder}
          hasOlderMessages={hasOlderMessages}
          composerText={composerText}
          originalLanguage={originalLanguage}
          sending={false}
          onBack={() => router.push('/driver/messages')}
          onComposerChange={setComposerText}
          onOriginalLanguageChange={setOriginalLanguage}
          onSend={() => void handleSend()}
          onLoadOlder={() => void handleLoadOlder()}
          onRetryMessage={(id) => void handleRetry(id)}
        />
      </div>
    </DriverPortalShell>
  );
}