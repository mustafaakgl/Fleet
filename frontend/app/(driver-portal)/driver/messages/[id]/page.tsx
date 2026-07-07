'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessengerChatPanel, type MessengerUiMessage } from '@/components/messenger/MessengerChatPanel';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { driverPortalApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { ConversationDetail, MessengerLanguage, MessengerMessage } from '@/lib/types';

const MESSENGER_LANGUAGES = new Set(['de', 'tr', 'en', 'pl', 'nl', 'it', 'es', 'ru']);

function normalizeMessengerLanguage(value: string | null | undefined): MessengerLanguage {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'de';
  return (MESSENGER_LANGUAGES.has(normalized) ? normalized : 'de') as MessengerLanguage;
}

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
  const [composerAttachments, setComposerAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [userLanguage, setUserLanguage] = useState<MessengerLanguage>(() =>
    normalizeMessengerLanguage(getUser()?.language),
  );
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
      setUserLanguage(normalizeMessengerLanguage(profile?.user.language));
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
    if (!text && composerAttachments.length === 0) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: MessengerUiMessage = {
      id: tempId,
      clientId: tempId,
      conversationId,
      senderUserId: currentUserId ?? 'unknown',
      senderName: currentUserName,
      originalText: text,
      translatedText: null,
      originalLanguage: userLanguage,
      targetLanguage: null,
      translationStatus: 'pending',
      createdAt: new Date().toISOString(),
      attachments: composerAttachments.map((file, index) => ({
        id: `${tempId}-att-${index}`,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        downloadUrl: typeof URL !== 'undefined' ? URL.createObjectURL(file) : '',
        createdAt: new Date().toISOString(),
      })),
      readByCurrentUser: true,
      deliveryState: 'sending',
      pendingAttachments: composerAttachments,
    };

    setMessages((previous) => sortMessages([...previous, optimisticMessage]));
    setComposerText('');
    setComposerAttachments([]);
    setUploadProgress(null);
    setSending(true);

    try {
      const created = await messengerApi.sendMessage(
        conversationId,
        {
          text: text || undefined,
          attachments: composerAttachments,
        },
        {
          onUploadProgress: (progressPercent) => setUploadProgress(progressPercent),
        },
      );
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== tempId).concat({ ...created, deliveryState: 'sent' })),
      );
      setUploadProgress(null);
    } catch (err) {
      setMessages((previous) => previous.map((message) => (
        message.id === tempId ? { ...message, deliveryState: 'error', translationStatus: 'failed' } : message
      )));
      setUploadProgress(null);
      setError(err instanceof Error ? err.message : t('driverPortal.messages.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [composerAttachments, composerText, conversationId, currentUserId, currentUserName, sortMessages, t, userLanguage]);

  const handleRetry = useCallback(async (messageId: string) => {
    const failed = messages.find((message) => message.id === messageId);
    if (!failed || !conversationId) return;

    setMessages((previous) => previous.map((message) => (
      message.id === messageId ? { ...message, deliveryState: 'sending' } : message
    )));
    setSending(true);

    try {
      const created = await messengerApi.sendMessage(conversationId, {
        text: failed.originalText || undefined,
        attachments: failed.pendingAttachments,
      });
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== messageId).concat({ ...created, deliveryState: 'sent' })),
      );
    } catch (err) {
      setMessages((previous) => previous.map((message) => (
        message.id === messageId ? { ...message, deliveryState: 'error' } : message
      )));
      setError(err instanceof Error ? err.message : t('driverPortal.messages.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [conversationId, messages, sortMessages, t]);

  const handleComposerAttachmentsAdd = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;

    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    setComposerAttachments((previous) => {
      const accepted: File[] = [];
      for (const file of nextFiles) {
        if (file.size > 10 * 1024 * 1024) {
          setError(t('messenger.attachmentTooLarge'));
          continue;
        }
        if (!allowedTypes.has(file.type)) {
          setError(t('messenger.attachmentTypeInvalid'));
          continue;
        }
        accepted.push(file);
      }

      const merged = [...previous, ...accepted].slice(0, 3);
      if (previous.length + accepted.length > 3) {
        setError(t('messenger.attachmentMaxCount'));
      }
      return merged;
    });
  }, [t]);

  const handleComposerAttachmentRemove = useCallback((index: number) => {
    setComposerAttachments((previous) => previous.filter((_, idx) => idx !== index));
  }, []);

  const handleDownloadAttachment = useCallback(async (attachmentId: string, fileName: string) => {
    try {
      const blob = await messengerApi.downloadAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messenger.attachmentDownloadError'));
    }
  }, [t]);

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
          composerAttachments={composerAttachments}
          uploadProgress={uploadProgress}
          userLanguage={userLanguage}
          sending={sending}
          onBack={() => router.push('/driver/messages')}
          onComposerChange={setComposerText}
          onComposerAttachmentsAdd={handleComposerAttachmentsAdd}
          onComposerAttachmentRemove={handleComposerAttachmentRemove}
          onSend={() => void handleSend()}
          onLoadOlder={() => void handleLoadOlder()}
          onDownloadAttachment={(id, name) => void handleDownloadAttachment(id, name)}
          onRetryMessage={(id) => void handleRetry(id)}
        />
      </div>
    </DriverPortalShell>
  );
}