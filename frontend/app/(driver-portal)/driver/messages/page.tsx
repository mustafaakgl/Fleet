'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  MessengerConversationList,
} from '@/components/messenger/MessengerConversationList';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  driverMessageAudienceLabelKey,
  DRIVER_MESSAGE_AUDIENCES,
  getConversationSearchText,
  type MessengerConversationPersonaFilter,
  type DriverMessageAudience,
} from '@/lib/messenger-utils';
import type { ConversationListItem } from '@/lib/types';

function previewText(item: ConversationListItem, fallback: string): string {
  const msg = item.lastMessage;
  if (!msg) return fallback;
  return msg.translatedText ?? msg.originalText;
}

export default function DriverMessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentUserId = getUser()?.id ?? null;
  const pollTimerRef = useRef<number | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState<MessengerConversationPersonaFilter>('all');

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

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      getConversationSearchText(conversation, currentUserId).includes(query),
    );
  }, [conversations, currentUserId, search]);

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

    const poll = async () => {
      if (document.hidden) return;
      try {
        await loadConversations();
      } catch {
        // keep current list visible
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
      active = false;
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
            {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
            <div className="h-[60dvh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-200">
              <MessengerConversationList
                conversations={filteredConversations}
                selectedConversationId={null}
                search={search}
                personaFilter={personaFilter}
                currentUserId={currentUserId}
                loading={loading}
                canCreateConversation={false}
                onSearchChange={setSearch}
                onPersonaFilterChange={setPersonaFilter}
                onSelectConversation={(id) => {
                  router.push(`/driver/messages/${id}`);
                }}
                previewText={(conversation) => previewText(conversation, t('driverPortal.messages.noMessages'))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DriverPortalShell>
  );
}
