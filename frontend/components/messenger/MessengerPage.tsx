'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Plus } from 'lucide-react';
import { MessengerActionsMenu } from '@/components/messenger/MessengerActionsMenu';
import { useTranslation } from 'react-i18next';
import { MessengerChatPanel } from '@/components/messenger/MessengerChatPanel';
import { MessengerConversationList } from '@/components/messenger/MessengerConversationList';
import { NewConversationDialog } from '@/components/messenger/NewConversationDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { authApi, driversApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
import { FLEET_LIST_CARD, FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_HEADER_ACTIONS, FLEET_PAGE_HEADER_TITLE } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import type {
  ConversationDetail,
  ConversationListItem,
  Driver,
  MessengerLanguage,
  MessengerMessage,
  MessengerStats,
  MessengerUnreadCount,
} from '@/lib/types';

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

const POLL_INTERVAL_MS = 10000;

export function MessengerPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
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
  const [stats, setStats] = useState<MessengerStats | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [composerText, setComposerText] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState<MessengerLanguage>('de');

  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [newConversationDriverId, setNewConversationDriverId] = useState('');
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationDepartment, setNewConversationDepartment] = useState<string>('dispatch');
  const [creatingConversation, setCreatingConversation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((user) => {
        if (cancelled) return;
        setRole(user.role);
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

  const fetchStats = useCallback(async () => {
    try {
      const response = await messengerApi.getStats({
        search: search.trim() || undefined,
        department: departmentFilter === 'all' ? undefined : departmentFilter,
      });
      setStats(response);
    } catch {
      setStats(null);
    }
  }, [search, departmentFilter]);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingConversations(true);
      try {
        const list = await messengerApi.listConversations({
          search: search.trim() || undefined,
          department: departmentFilter === 'all' ? undefined : departmentFilter,
        });
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
    [search, departmentFilter, selectedConversationId, t],
  );

  const refreshLeftPanel = useCallback(async () => {
    await Promise.all([fetchConversations(true), fetchUnreadCount(), fetchStats()]);
  }, [fetchConversations, fetchUnreadCount, fetchStats]);

  const fetchConversationDetailAndMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      setError(null);
      try {
        const [detail, list] = await Promise.all([
          messengerApi.getConversation(conversationId),
          messengerApi.listMessages(conversationId, { limit: 50 }),
        ]);
        setSelectedConversation(detail);
        setMessages(list);
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
      void Promise.all([fetchConversations(false), fetchUnreadCount(), fetchStats()]);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [bootLoading, forbidden, fetchConversations, fetchUnreadCount, fetchStats]);

  useEffect(() => {
    if (bootLoading || forbidden) return;
    const interval = window.setInterval(() => {
      void refreshLeftPanel();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [bootLoading, forbidden, refreshLeftPanel]);

  useEffect(() => {
    if (!selectedConversationId || forbidden || bootLoading) {
      setSelectedConversation(null);
      setMessages([]);
      return;
    }
    void fetchConversationDetailAndMessages(selectedConversationId);
  }, [selectedConversationId, forbidden, bootLoading, fetchConversationDetailAndMessages]);

  const pollMessages = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      const last = messages[messages.length - 1];
      const incremental = await messengerApi.listMessages(selectedConversationId, {
        since: last?.createdAt,
        afterId: last?.id,
        limit: 50,
      });
      if (incremental.length > 0) {
        setMessages((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          const merged = [...previous];
          for (const message of incremental) {
            if (!seen.has(message.id)) {
              merged.push(message);
            }
          }
          return merged;
        });
        await messengerApi.markConversationRead(selectedConversationId);
        await refreshLeftPanel();
      }
    } catch {
      // Ignore transient polling errors.
    }
  }, [messages, refreshLeftPanel, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const interval = window.setInterval(() => {
      void pollMessages();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pollMessages, selectedConversationId]);

  const canCreateConversation = useMemo(
    () => role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office',
    [role],
  );

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversationId) return;
    const text = composerText.trim();
    if (!text) {
      showToast(t('messenger.emptyMessage'), 'error');
      return;
    }

    setSending(true);
    try {
      const created = await messengerApi.sendMessage(selectedConversationId, { text, originalLanguage });
      setMessages((previous) => [...previous, created]);
      setComposerText('');
      await refreshLeftPanel();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('messenger.sendError'), 'error');
    } finally {
      setSending(false);
    }
  }, [
    composerText,
    originalLanguage,
    refreshLeftPanel,
    selectedConversationId,
    showToast,
    t,
  ]);

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
      setMessages(created.messagesPreview ?? []);
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

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const csv = await messengerApi.exportConversations({
        search: search.trim() || undefined,
        department: departmentFilter === 'all' ? undefined : departmentFilter,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `messenger-conversations-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast(t('messenger.export.success'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('messenger.export.error'), 'error');
    } finally {
      setExporting(false);
    }
  }, [departmentFilter, search, showToast, t]);

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
      <div className={FLEET_PAGE_HEADER}>
        <div className={FLEET_PAGE_HEADER_TITLE}>
          <MessageSquare className="h-5 w-5 shrink-0 text-[#1a4d7a] sm:h-6 sm:w-6" />
          <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{t('messenger.title')}</h1>
          {unreadCount.total > 0 ? (
            <span className="shrink-0 rounded-full bg-[#1a4d7a] px-2.5 py-0.5 text-xs font-semibold text-white">
              {t('messenger.unread', { count: unreadCount.total })}
            </span>
          ) : null}
        </div>
        <div className={FLEET_PAGE_HEADER_ACTIONS}>
          <MessengerActionsMenu onExport={() => void handleExport()} exporting={exporting} />
          {canCreateConversation ? (
            <Button
              type="button"
              className={cn(BRAND_BTN_PRIMARY, 'w-full sm:w-auto')}
              onClick={() => setNewConversationOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('messenger.newConversation')}
            </Button>
          ) : null}
        </div>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('messenger.stats.conversations')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-semibold text-slate-900">{stats.totalConversations}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('messenger.stats.unread')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-semibold text-[#1a4d7a]">{stats.unreadTotal}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('messenger.stats.needsAttention')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-semibold text-orange-600">{stats.conversationsWithUnread}</p>
            </CardContent>
          </Card>
          <Card className={FLEET_LIST_CARD}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t('messenger.stats.messages24h')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-semibold text-slate-900">{stats.messagesLast24Hours}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

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
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            search={search}
            departmentFilter={departmentFilter}
            loading={loadingConversations}
            onSearchChange={setSearch}
            onDepartmentFilterChange={setDepartmentFilter}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              void fetchConversationDetailAndMessages(id);
            }}
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
            composerText={composerText}
            originalLanguage={originalLanguage}
            sending={sending}
            onBack={() => setSelectedConversationId(null)}
            onComposerChange={setComposerText}
            onOriginalLanguageChange={setOriginalLanguage}
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
