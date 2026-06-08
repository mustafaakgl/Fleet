'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Search, Send, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authApi, driversApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
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

const POLL_INTERVAL_MS = 10000;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function conversationTitle(conversation: ConversationListItem | ConversationDetail): string {
  const driverName = `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim();
  return conversation.subject?.trim() ? `${driverName} · ${conversation.subject}` : driverName;
}

export default function MessengerPage() {
  const { t } = useTranslation();
  const previewText = (conversation: ConversationListItem): string => {
    if (!conversation.lastMessage) return t('messenger.noMessagesPreview');
    return conversation.lastMessage.translatedText ?? conversation.lastMessage.originalText;
  };
  const [role, setRole] = useState<string | null>(() => getUser()?.role ?? null);
  const [forbidden, setForbidden] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<MessengerUnreadCount>({ total: 0, byConversation: [] });
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
  const [targetLanguage, setTargetLanguage] = useState<MessengerLanguage | 'none'>('none');

  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [newConversationDriverId, setNewConversationDriverId] = useState('');
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationDepartment, setNewConversationDepartment] = useState<string>('dispatch');
  const [creatingConversation, setCreatingConversation] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);

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
    await Promise.all([fetchConversations(true), fetchUnreadCount()]);
  }, [fetchConversations, fetchUnreadCount]);

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
        const driverParticipant = detail.participants.find((participant) => participant.role === 'driver');
        const preferred = (driverParticipant?.user as { language?: string } | undefined)?.language;
        if (
          preferred === 'de' ||
          preferred === 'tr' ||
          preferred === 'en' ||
          preferred === 'pl' ||
          preferred === 'nl' ||
          preferred === 'it'
        ) {
          setTargetLanguage(preferred);
        } else {
          setTargetLanguage('none');
        }
        await messengerApi.markConversationRead(conversationId);
        await fetchUnreadCount();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('messenger.loadConversationError'));
      } finally {
        setLoadingMessages(false);
      }
    },
    [fetchConversations, fetchUnreadCount, t],
  );

  useEffect(() => {
    if (bootLoading || forbidden) return;
    const timer = window.setTimeout(() => {
      void Promise.all([fetchConversations(false), fetchUnreadCount()]);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [bootLoading, forbidden, fetchConversations, fetchUnreadCount]);

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
      // Ignore transient polling errors; manual/open actions handle visible errors.
    }
  }, [messages, refreshLeftPanel, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const interval = window.setInterval(() => {
      void pollMessages();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pollMessages, selectedConversationId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredConversations = useMemo(() => conversations, [conversations]);

  const selectedDriverName = selectedConversation
    ? `${selectedConversation.driver.firstName} ${selectedConversation.driver.lastName}`.trim()
    : null;

  const canCreateConversation =
    role === 'admin' || role === 'boss' || role === 'accounting' || role === 'office';

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversationId) return;
    const text = composerText.trim();
    if (!text) {
      showToast(t('messenger.emptyMessage'), 'error');
      return;
    }

    setSending(true);
    try {
      const payload =
        targetLanguage === 'none'
          ? { text, originalLanguage }
          : { text, originalLanguage, targetLanguage };
      const created = await messengerApi.sendMessage(selectedConversationId, payload);
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
    targetLanguage,
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
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={MessageSquare}
            title={t('messenger.forbiddenTitle')}
            subtitle={t('messenger.forbiddenSubtitle')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('messenger.title')}</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            {t('messenger.unread', { count: unreadCount.total })}
          </span>
        </div>
        {canCreateConversation && (
          <Button onClick={() => setNewConversationOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('messenger.newConversation')}
          </Button>
        )}
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        <Card className="min-h-[620px]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">{t('messenger.conversations')}</CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('messenger.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="all">{t('messenger.allDepartments')}</option>
              <option value="dispatch">{t('messenger.dept.dispatch')}</option>
              <option value="hr">{t('messenger.dept.hr')}</option>
              <option value="accounting">{t('messenger.dept.accounting')}</option>
              <option value="maintenance">{t('messenger.dept.maintenance')}</option>
              <option value="general">{t('messenger.dept.general')}</option>
            </Select>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingConversations ? (
              <>
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={t('messenger.noConversationsTitle')}
                subtitle={t('messenger.noConversationsSubtitle')}
              />
            ) : (
              filteredConversations.map((conversation) => {
                const active = conversation.id === selectedConversationId;
                return (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      void fetchConversationDetailAndMessages(conversation.id);
                    }}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-gray-900">
                        {conversationTitle(conversation)}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">{previewText(conversation)}</p>
                    <p className="mt-2 text-[11px] text-gray-500">{formatDateTime(conversation.lastMessageAt)}</p>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[620px]">
          {!selectedConversationId ? (
            <CardContent className="p-6">
              <EmptyState
                icon={UserRound}
                title={t('messenger.noConversationSelectedTitle')}
                subtitle={t('messenger.noConversationSelectedSubtitle')}
              />
            </CardContent>
          ) : loadingMessages ? (
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </CardContent>
          ) : selectedConversation ? (
            <>
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="text-base">{conversationTitle(selectedConversation)}</CardTitle>
                <p className="text-xs text-gray-500">
                  {t('messenger.participants')}{' '}
                  {selectedConversation.participants
                    .map((participant) => participant.user.fullName)
                    .join(', ')}
                </p>
              </CardHeader>

              <CardContent className="flex h-[520px] flex-col gap-3 p-4">
                <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-gray-100 bg-gray-50 p-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('messenger.noMessages')}</p>
                  ) : (
                    messages.map((message) => {
                      const own = message.senderUserId === getUser()?.id;
                      return (
                        <div
                          key={message.id}
                          className={`max-w-[85%] rounded-lg border p-2.5 text-sm ${
                            own
                              ? 'ml-auto border-blue-200 bg-blue-50'
                              : 'mr-auto border-gray-200 bg-white'
                          }`}
                        >
                          <p className="mb-1 text-xs font-semibold text-gray-600">{message.senderName}</p>
                          {message.translatedText && !own ? (
                            <>
                              <p className="whitespace-pre-wrap text-gray-900">{message.translatedText}</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                                {t('messenger.originalLabel', { lang: message.originalLanguage })} {message.originalText}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap text-gray-900">{message.originalText}</p>
                              {message.translatedText ? (
                                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">
                                  {message.translatedText}
                                </p>
                              ) : null}
                            </>
                          )}
                          {message.translationStatus === 'failed' ? (
                            <p className="mt-1 text-[11px] text-amber-700">{t('messenger.translationFailed')}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-gray-500">{formatDateTime(message.createdAt)}</p>
                        </div>
                      );
                    })
                  )}
                  <div ref={messageEndRef} />
                </div>

                <div className="space-y-2 rounded-md border border-gray-200 p-3">
                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    rows={3}
                    placeholder={t('messenger.messagePlaceholder', { name: selectedDriverName ?? '' }).trim()}
                    className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={sending}
                  />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Select
                      value={originalLanguage}
                      onChange={(e) => setOriginalLanguage(e.target.value as MessengerLanguage)}
                      disabled={sending}
                    >
                      <option value="de">{t('messenger.originalPrefix')}: de</option>
                      <option value="tr">{t('messenger.originalPrefix')}: tr</option>
                      <option value="en">{t('messenger.originalPrefix')}: en</option>
                      <option value="pl">{t('messenger.originalPrefix')}: pl</option>
                      <option value="nl">{t('messenger.originalPrefix')}: nl</option>
                      <option value="it">{t('messenger.originalPrefix')}: it</option>
                      <option value="es">{t('messenger.originalPrefix')}: es</option>
                      <option value="ru">{t('messenger.originalPrefix')}: ru</option>
                    </Select>
                    <Select
                      value={targetLanguage}
                      onChange={(e) =>
                        setTargetLanguage(e.target.value as MessengerLanguage | 'none')
                      }
                      disabled={sending}
                    >
                      <option value="none">{t('messenger.targetPrefix')}: {t('messenger.targetNone')}</option>
                      <option value="de">{t('messenger.targetPrefix')}: de</option>
                      <option value="tr">{t('messenger.targetPrefix')}: tr</option>
                      <option value="en">{t('messenger.targetPrefix')}: en</option>
                      <option value="pl">{t('messenger.targetPrefix')}: pl</option>
                      <option value="nl">{t('messenger.targetPrefix')}: nl</option>
                      <option value="it">{t('messenger.targetPrefix')}: it</option>
                      <option value="es">{t('messenger.targetPrefix')}: es</option>
                      <option value="ru">{t('messenger.targetPrefix')}: ru</option>
                    </Select>
                    <Button onClick={handleSendMessage} disabled={sending || !composerText.trim()}>
                      <Send className="mr-2 h-4 w-4" />
                      {sending ? t('messenger.sending') : t('messenger.send')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={t('messenger.conversationUnavailableTitle')}
                subtitle={t('messenger.conversationUnavailableSubtitle')}
              />
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('messenger.newConversation')}</DialogTitle>
            <DialogDescription>{t('messenger.newConvDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('messenger.driver')}</label>
              <Select
                value={newConversationDriverId}
                onChange={(e) => setNewConversationDriverId(e.target.value)}
                disabled={driversLoading || creatingConversation}
              >
                <option value="">{t('messenger.selectDriver')}</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {`${driver.first_name} ${driver.last_name}`.trim()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('messenger.department')}</label>
              <Select
                value={newConversationDepartment}
                onChange={(e) => setNewConversationDepartment(e.target.value)}
                disabled={creatingConversation}
              >
                <option value="dispatch">{t('messenger.dept.dispatch')}</option>
                <option value="hr">{t('messenger.dept.hr')}</option>
                <option value="accounting">{t('messenger.dept.accounting')}</option>
                <option value="maintenance">{t('messenger.dept.maintenance')}</option>
                <option value="general">{t('messenger.dept.general')}</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('messenger.subjectOptional')}</label>
              <Input
                value={newConversationSubject}
                onChange={(e) => setNewConversationSubject(e.target.value)}
                placeholder={t('messenger.subjectPlaceholder')}
                disabled={creatingConversation}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConversationOpen(false)} disabled={creatingConversation}>
              {t('messenger.cancel')}
            </Button>
            <Button onClick={handleCreateConversation} disabled={creatingConversation || !newConversationDriverId}>
              {creatingConversation ? t('messenger.creating') : t('messenger.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-700' : 'bg-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
