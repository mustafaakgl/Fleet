'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, MessageSquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { messengerApi } from '@/lib/api';
import {
  departmentBadgeClass,
  driverMessageAudienceLabelKey,
  DRIVER_MESSAGE_AUDIENCES,
  formatMessengerRelativeTime,
  type DriverMessageAudience,
} from '@/lib/messenger-utils';
import type { ConversationListItem } from '@/lib/types';
import { cn } from '@/lib/utils';

function previewText(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return '';
  return msg.translatedText ?? msg.originalText;
}

export default function DriverMessagesPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [audience, setAudience] = useState<DriverMessageAudience>('dispatch');
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    const [rows, unreadCount] = await Promise.all([
      messengerApi.listConversations({ limit: 50 }),
      messengerApi.getUnreadCount(),
    ]);
    setConversations(rows);
    setUnread(unreadCount.total);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadConversations()
      .catch((err) => {
        if (!active) return;
        setConversations([]);
        setError(err instanceof Error ? err.message : t('driverPortal.messages.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadConversations, t]);

  async function handleStartConversation(event: React.FormEvent) {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      setCreateError(t('driverPortal.messages.subjectRequired'));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const created = await messengerApi.createDriverConversation(trimmedSubject, audience);
      setSubject('');
      router.push(`/driver/messages/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('driverPortal.messages.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <DriverPortalShell>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-4 w-4 text-[#1a4d7a]" />
              {t('driverPortal.messages.newTitle')}
            </CardTitle>
            <p className="text-sm text-slate-600">{t('driverPortal.messages.newSubtitle')}</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(e) => void handleStartConversation(e)}>
              <div className="space-y-2">
                <Label htmlFor="message-audience">{t('driverPortal.messages.recipient')}</Label>
                <Select
                  id="message-audience"
                  value={audience}
                  disabled={creating}
                  onChange={(e) => setAudience(e.target.value as DriverMessageAudience)}
                >
                  {DRIVER_MESSAGE_AUDIENCES.map((value) => (
                    <option key={value} value={value}>
                      {t(driverMessageAudienceLabelKey(value))}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message-subject">{t('driverPortal.messages.subject')}</Label>
                <Input
                  id="message-subject"
                  value={subject}
                  disabled={creating}
                  placeholder={t('driverPortal.messages.subjectPlaceholder')}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
              <Button
                type="submit"
                className="w-full bg-[#1a4d7a] hover:bg-[#163a5c]"
                disabled={creating}
              >
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('driverPortal.messages.startConversation')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('driverPortal.messages.recentTitle')}</CardTitle>
            <p className="text-sm text-slate-600">
              {t('driverPortal.messages.subtitle', { count: unread })}
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('driverPortal.assignments.loading')}
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : conversations.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">{t('driverPortal.messages.empty')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {conversations.map((conversation) => {
                  const dept = conversation.department as DriverMessageAudience | undefined;
                  const audienceLabel =
                    dept && DRIVER_MESSAGE_AUDIENCES.includes(dept)
                      ? t(driverMessageAudienceLabelKey(dept))
                      : null;

                  return (
                    <li key={conversation.id}>
                      <Link
                        href={`/driver/messages/${conversation.id}`}
                        className="flex items-start justify-between gap-3 rounded-md py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {conversation.subject ?? t('driverPortal.messages.thread')}
                            </p>
                            {audienceLabel ? (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  departmentBadgeClass(dept),
                                )}
                              >
                                {audienceLabel}
                              </span>
                            ) : null}
                            {conversation.unreadCount > 0 ? (
                              <span className="rounded-full bg-[#1a4d7a] px-2 py-0.5 text-[10px] font-semibold text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                            {previewText(conversation) || t('driverPortal.messages.noMessages')}
                          </p>
                          {conversation.lastMessageAt ? (
                            <p className="mt-1 text-xs text-slate-400">
                              {formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language)}
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DriverPortalShell>
  );
}
