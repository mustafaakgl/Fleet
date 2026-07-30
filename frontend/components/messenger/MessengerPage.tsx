'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MessengerChatPanel, type MessengerUiMessage } from '@/components/messenger/MessengerChatPanel';
import { MessengerConversationList } from '@/components/messenger/MessengerConversationList';
import { NewConversationDialog } from '@/components/messenger/NewConversationDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { authApi, driversApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
import { FLEET_LIST_CARD, FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_HEADER_ACTIONS, FLEET_PAGE_HEADER_TITLE } from '@/lib/fleet-table';
import {
  getConversationCategory,
  getConversationSearchText,
  shouldShowConversationInMessenger,
  type MessengerConversationPersonaFilter,
} from '@/lib/messenger-utils';
import { cn } from '@/lib/utils';
import type {
  ConversationDetail,
  ConversationListItem,
  Driver,
  MessengerLanguage,
  MessengerMessage,
  MessengerUnreadCount,
} from '@/lib/types';

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

const MESSENGER_LANGUAGES = new Set(['de', 'tr', 'en', 'pl', 'nl', 'it', 'es', 'ru']);

function normalizeMessengerLanguage(value: string | null | undefined): MessengerLanguage {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'de';
  return (MESSENGER_LANGUAGES.has(normalized) ? normalized : 'de') as MessengerLanguage;
}

export function MessengerPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const pollTimerRef = useRef<number | null>(null);
  const currentUser = getUser();
  const currentUserId = currentUser?.id ?? null;
  const currentUserName = currentUser?.name ?? currentUser?.email ?? 'User';
  const previewText = useCallback(
    (conversation: ConversationListItem): string => {
      if (!conversation.lastMessage) return t('messenger.noMessagesPreview');
      return conversation.lastMessage.translatedText ?? conversation.lastMessage.originalText;
    },
    [t],
  );

  const [role, setRole] = useState<string | null>(() => getUser()?.role ?? null);
  const [forbidden, setForbidden] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<MessengerUnreadCount>({ total: 0, byConversation: [] });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessengerUiMessage[]>([]);
  const [search, setSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState<MessengerConversationPersonaFilter>('all');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [userLanguage, setUserLanguage] = useState<MessengerLanguage>(() =>
    normalizeMessengerLanguage(getUser()?.language),
  );

  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [newConversationDriverId, setNewConversationDriverId] = useState('');
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationDepartment, setNewConversationDepartment] = useState<string>('dispatch');
  const [creatingConversation, setCreatingConversation] = useState(false);

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
    const tempMessages = current.filter((message) => message.deliveryState === 'sending' || message.deliveryState === 'error');
    const mapped = incoming.map((message) => ({ ...message, deliveryState: 'sent' as const }));
    const byId = new Map<string, MessengerUiMessage>();

    for (const message of [...mapped, ...tempMessages]) {
      byId.set(message.id, message);
    }

    return sortMessages(Array.from(byId.values()));
  }, [sortMessages]);

  const patchConversationPreview = useCallback((message: MessengerUiMessage, unreadDelta = 0) => {
    setConversations((previous) => {
      const next = previous.map((conversation) => {
        if (conversation.id !== message.conversationId) return conversation;
        return {
          ...conversation,
          lastMessage: {
            id: message.id,
            senderUserId: message.senderUserId,
            senderName: message.senderName,
            originalText: message.originalText,
            translatedText: message.translatedText,
            originalLanguage: message.originalLanguage,
            targetLanguage: message.targetLanguage,
            translationStatus: message.translationStatus,
            createdAt: message.createdAt,
          },
          lastMessageAt: message.createdAt,
          unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
        };
      });
      return [...next].sort((left, right) => (right.lastMessageAt ?? '').localeCompare(left.lastMessageAt ?? ''));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((user) => {
        if (cancelled) return;
        setRole(user.role);
        setUserLanguage(normalizeMessengerLanguage(user.language));
        setForbidden((user.role as string) === 'driver');
      })
      .catch(() => {
        if (cancelled) return;
        const localRole = getUser()?.role ?? null;
        setRole(localRole);
        setForbidden((localRole as string | null) === 'driver');
      })
      .finally(() => {
        if (!cancelled) setBootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fetchUnreadCount = useCallback(async () => {
    const response = await messengerApi.getUnreadCount();
    setUnreadCount(response);
  }, []);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingConversations(true);
      try {
        const list = await messengerApi.listConversations({ limit: 100 });
        setConversations(list);
        if (!silent) {
          if (!selectedConversationId && list.length > 0) {
            setSelectedConversationId(list[0].id);
          } else if (selectedConversationId && !list.some((item) => item.id === selectedConversationId)) {
            setSelectedConversationId(list[0]?.id ?? null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('messenger.loadConversationsError'));
      } finally {
        if (!silent) setLoadingConversations(false);
      }
    },
    [selectedConversationId, t],
  );

  const refreshLeftPanel = useCallback(async () => {
    await Promise.all([fetchConversations(true), fetchUnreadCount()]);
  }, [fetchConversations, fetchUnreadCount]);

  const fetchConversationDetailAndMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      setError(null);
      try {
        const [detail, list] = await Promise.all([
          messengerApi.getConversation(conversationId),
          messengerApi.listMessages(conversationId, { limit: 40 }),
        ]);
        setSelectedConversation(detail);
        setMessages(list.map((message) => ({ ...message, deliveryState: 'sent' as const })));
        setHasOlderMessages(list.length >= 40);
        await messengerApi.markConversationRead(conversationId);
        await fetchUnreadCount();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('messenger.loadConversationError'));
      } finally {
        setLoadingMessages(false);
      }
    },
    [fetchUnreadCount, t],
  );

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      setSelectedConversationId(conversationId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (bootLoading || forbidden) return;
    const timer = window.setTimeout(() => {
      void Promise.all([fetchConversations(false), fetchUnreadCount()]);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [bootLoading, forbidden, fetchConversations, fetchUnreadCount]);

  useEffect(() => {
    if (bootLoading || forbidden) return;

    const poll = async () => {
      if (document.hidden) return;
      await refreshLeftPanel();
      if (selectedConversationId) {
        try {
          const latest = await messengerApi.listMessages(selectedConversationId, { limit: 40 });
          setMessages((previous) => mergeMessages(previous, latest));
          await messengerApi.markConversationRead(selectedConversationId);
          setMessages((previous) => previous.map((message) => (
            message.senderUserId === currentUserId ? message : { ...message, readByCurrentUser: true }
          )));
          await fetchUnreadCount();
        } catch {
          // keep stale thread visible
        }
      }
    };

    void poll();
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
  }, [bootLoading, currentUserId, fetchUnreadCount, forbidden, mergeMessages, refreshLeftPanel, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || forbidden || bootLoading) {
      setSelectedConversation(null);
      setMessages([]);
      return;
    }
    void fetchConversationDetailAndMessages(selectedConversationId);
  }, [selectedConversationId, forbidden, bootLoading, fetchConversationDetailAndMessages]);

  const canCreateConversation = useMemo(
    () => role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office',
    [role],
  );

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (!shouldShowConversationInMessenger(conversation, currentUserId)) {
        return false;
      }
      const personaMatch =
        personaFilter === 'all' || getConversationCategory(conversation, currentUserId) === personaFilter;
      if (!personaMatch) {
        return false;
      }
      if (!query) {
        return true;
      }
      return getConversationSearchText(conversation, currentUserId).includes(query);
    });
  }, [conversations, currentUserId, personaFilter, search]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversationId) return;
    const text = composerText.trim();
    if (!text && composerAttachments.length === 0) {
      showToast(t('messenger.emptyMessage'), 'error');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: MessengerUiMessage = {
      id: tempId,
      clientId: tempId,
      conversationId: selectedConversationId,
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
    patchConversationPreview(optimisticMessage);
    setComposerText('');
    setComposerAttachments([]);
    setUploadProgress(null);
    setSending(true);

    try {
      const created = await messengerApi.sendMessage(
        selectedConversationId,
        { text: text || undefined, attachments: composerAttachments },
        {
          onUploadProgress: (progressPercent) => {
            setUploadProgress(progressPercent);
          },
        },
      );
      const delivered = { ...created, deliveryState: 'sent' as const };
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== tempId).concat(delivered)),
      );
      patchConversationPreview(delivered);
      setUploadProgress(null);
      await refreshLeftPanel();
    } catch (e) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === tempId
            ? { ...message, deliveryState: 'error', translationStatus: 'failed' }
            : message,
        ),
      );
      setUploadProgress(null);
      showToast(e instanceof Error ? e.message : t('messenger.sendError'), 'error');
    } finally {
      setSending(false);
    }
  }, [
    composerAttachments,
    composerText,
    currentUserId,
    currentUserName,
    patchConversationPreview,
    refreshLeftPanel,
    selectedConversationId,
    showToast,
    sortMessages,
    t,
  ]);

  const handleRetryMessage = useCallback(async (messageId: string) => {
    const failed = messages.find((message) => message.id === messageId);
    if (!failed || !selectedConversationId) return;

    setMessages((previous) => previous.map((message) => (
      message.id === messageId ? { ...message, deliveryState: 'sending' } : message
    )));
    setSending(true);

    try {
      const created = await messengerApi.sendMessage(selectedConversationId, {
        text: failed.originalText || undefined,
        attachments: failed.pendingAttachments,
      });
      const delivered = { ...created, deliveryState: 'sent' as const };
      setMessages((previous) =>
        sortMessages(previous.filter((message) => message.id !== messageId).concat(delivered)),
      );
      patchConversationPreview(delivered);
      await refreshLeftPanel();
    } catch (e) {
      setMessages((previous) => previous.map((message) => (
        message.id === messageId ? { ...message, deliveryState: 'error' } : message
      )));
      showToast(e instanceof Error ? e.message : t('messenger.sendError'), 'error');
    } finally {
      setSending(false);
    }
  }, [messages, patchConversationPreview, refreshLeftPanel, selectedConversationId, showToast, sortMessages, t]);

  const handleComposerAttachmentsAdd = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;

    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    setComposerAttachments((previous) => {
      const accepted: File[] = [];
      for (const file of nextFiles) {
        if (file.size > 10 * 1024 * 1024) {
          showToast(t('messenger.attachmentTooLarge'), 'error');
          continue;
        }
        if (!allowedTypes.has(file.type)) {
          showToast(t('messenger.attachmentTypeInvalid'), 'error');
          continue;
        }
        accepted.push(file);
      }

      const merged = [...previous, ...accepted].slice(0, 3);
      if (previous.length + accepted.length > 3) {
        showToast(t('messenger.attachmentMaxCount'), 'error');
      }
      return merged;
    });
  }, [showToast, t]);

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
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('messenger.attachmentDownloadError'), 'error');
    }
  }, [showToast, t]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedConversationId || loadingOlder) return;
    const oldestServerMessage = messages.find((message) => !message.id.startsWith('temp-'));
    if (!oldestServerMessage) return;

    setLoadingOlder(true);
    try {
      const older = await messengerApi.listMessages(selectedConversationId, {
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
    } catch {
      setHasOlderMessages(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, mergeMessages, messages, selectedConversationId]);

  const loadDrivers = useCallback(async () => {
    if (!canCreateConversation) return;
    setDriversLoading(true);
    try {
      const response = await driversApi.list({ limit: 200, status: 'active' });
      setDrivers(response.data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('messenger.loadDriversError'), 'error');
    } finally {
      setDriversLoading(false);
    }
  }, [canCreateConversation, showToast, t]);

  useEffect(() => {
    if (newConversationOpen && drivers.length === 0) {
      void loadDrivers();
    }
  }, [drivers.length, loadDrivers, newConversationOpen]);

  const handleCreateConversation = useCallback(async () => {
    if (!newConversationDriverId) {
      showToast(t('messenger.selectDriverError'), 'error');
      return;
    }
    setCreatingConversation(true);
    try {
      const created = await messengerApi.createConversation(
        newConversationDriverId,
        newConversationSubject.trim() || undefined,
        newConversationDepartment,
      );
      setNewConversationOpen(false);
      setNewConversationSubject('');
      setNewConversationDriverId('');
      await refreshLeftPanel();
      setSelectedConversationId(created.id);
      setSelectedConversation(created);
      setMessages((created.messagesPreview ?? []).map((message) => ({ ...message, deliveryState: 'sent' as const })));
      setHasOlderMessages(false);
      showToast(t('messenger.created'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('messenger.createError'), 'error');
    } finally {
      setCreatingConversation(false);
    }
  }, [
    newConversationDriverId,
    newConversationDepartment,
    newConversationSubject,
    refreshLeftPanel,
    showToast,
    t,
  ]);

  if (bootLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <Card className={FLEET_LIST_CARD}>
        <div className="p-6">
          <EmptyState
            icon={MessageSquare}
            title={t('messenger.forbiddenTitle')}
            subtitle={t('messenger.forbiddenSubtitle')}
          />
        </div>
      </Card>
    );
  }

  return (
    <div className={FLEET_PAGE}>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <Card
        className={cn(
          FLEET_LIST_CARD,
          'grid min-h-[min(720px,calc(100dvh-12rem))] grid-cols-1 overflow-hidden xl:grid-cols-[320px_1fr]',
        )}
      >
        <div
          className={cn(
            'min-h-0 border-slate-200 xl:border-r',
            selectedConversationId ? 'hidden xl:flex xl:flex-col' : 'flex flex-col',
          )}
        >
          <MessengerConversationList
            conversations={filteredConversations}
            selectedConversationId={selectedConversationId}
            search={search}
            personaFilter={personaFilter}
            currentUserId={currentUserId}
            loading={loadingConversations}
            canCreateConversation={canCreateConversation}
            unreadTotal={unreadCount.total}
            onSearchChange={setSearch}
            onPersonaFilterChange={setPersonaFilter}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              void fetchConversationDetailAndMessages(id);
            }}
            onCreateConversation={canCreateConversation ? () => setNewConversationOpen(true) : undefined}
            previewText={previewText}
          />
        </div>

        <div
          className={cn(
            'min-h-0',
            !selectedConversationId ? 'hidden xl:flex xl:flex-col' : 'flex flex-col',
          )}
        >
          <MessengerChatPanel
            selectedConversationId={selectedConversationId}
            selectedConversation={selectedConversation}
            messages={messages}
            loading={loadingMessages}
            loadingOlder={loadingOlder}
            hasOlderMessages={hasOlderMessages}
            composerText={composerText}
            composerAttachments={composerAttachments}
            uploadProgress={uploadProgress}
            userLanguage={userLanguage}
            sending={sending}
            onBack={() => setSelectedConversationId(null)}
            onComposerChange={setComposerText}
            onComposerAttachmentsAdd={handleComposerAttachmentsAdd}
            onComposerAttachmentRemove={handleComposerAttachmentRemove}
            onLoadOlder={() => void handleLoadOlderMessages()}
            onDownloadAttachment={(id, name) => void handleDownloadAttachment(id, name)}
            onRetryMessage={(id) => void handleRetryMessage(id)}
            onSend={() => void handleSendMessage()}
          />
        </div>
      </Card>

      <NewConversationDialog
        open={newConversationOpen}
        drivers={drivers}
        driversLoading={driversLoading}
        driverId={newConversationDriverId}
        subject={newConversationSubject}
        department={newConversationDepartment}
        creating={creatingConversation}
        onOpenChange={setNewConversationOpen}
        onDriverChange={setNewConversationDriverId}
        onSubjectChange={setNewConversationSubject}
        onDepartmentChange={setNewConversationDepartment}
        onCreate={() => void handleCreateConversation()}
      />

      {toast ? (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg duration-200',
            toast.type === 'success' ? 'bg-emerald-700' : 'bg-red-700',
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
