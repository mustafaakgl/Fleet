'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MessengerComposer } from '@/components/messenger/MessengerComposer';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { driverPortalApi, messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  departmentBadgeClass,
  driverMessageAudienceLabelKey,
  DRIVER_MESSAGE_AUDIENCES,
  formatMessengerDateTime,
  groupMessagesByDay,
  type DriverMessageAudience,
} from '@/lib/messenger-utils';
import type { ConversationDetail, MessengerLanguage, MessengerMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function DriverMessageThreadPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState<MessengerLanguage>('de');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userId = getUser()?.id;

  useEffect(() => {
    const id = params.id;
    if (!id) return;

    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [detail, thread] = await Promise.all([
          messengerApi.getConversation(id),
          messengerApi.listMessages(id),
        ]);
        if (!active) return;
        setConversation(detail);
        setMessages(thread);
        const profile = await driverPortalApi.me().catch(() => null);
        setOriginalLanguage((profile?.user.language as MessengerLanguage | undefined) ?? 'de');
        await messengerApi.markConversationRead(id);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t('driverPortal.messages.threadError'));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => {
      messengerApi
        .listMessages(id)
        .then((thread) => {
          if (active) setMessages(thread);
        })
        .catch(() => undefined);
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [params.id, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!params.id || !composerText.trim()) return;
    setSending(true);
    try {
      const sent = await messengerApi.sendMessage(params.id, {
        text: composerText.trim(),
        originalLanguage,
      });
      setMessages((prev) => [...prev, sent]);
      setComposerText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.messages.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  const grouped = groupMessagesByDay(
    messages,
    { today: t('driverPortal.messages.today'), yesterday: t('driverPortal.messages.yesterday') },
    i18n.language,
  );

  return (
    <DriverPortalShell>
      <DriverPageBack href="/driver/messages" label={t('driverPortal.messages.back')} />
      <div className="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">
              {conversation?.subject ?? t('driverPortal.messages.thread')}
            </p>
            {conversation?.department &&
            DRIVER_MESSAGE_AUDIENCES.includes(conversation.department as DriverMessageAudience) ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  departmentBadgeClass(conversation.department),
                )}
              >
                {t(driverMessageAudienceLabelKey(conversation.department as DriverMessageAudience))}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500">{t('driverPortal.messages.noMessages')}</p>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="space-y-2">
                <p className="text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                {group.messages.map((message) => {
                  const own = message.senderUserId === userId;
                  return (
                    <div
                      key={message.id}
                      className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', own
                        ? 'ml-auto bg-[#1a4d7a] text-white'
                        : 'mr-auto border border-slate-200 bg-slate-50 text-slate-900')}
                    >
                      {!own ? (
                        <p className="mb-1 text-[11px] font-medium text-slate-500">{message.senderName}</p>
                      ) : null}
                      {message.translatedText && !own ? (
                        <>
                          <p className="whitespace-pre-wrap">{message.translatedText}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {t('driverPortal.messages.original', { lang: message.originalLanguage })}{' '}
                            {message.originalText}
                          </p>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.originalText}</p>
                      )}
                      <p className={cn('mt-1 text-[10px]', own ? 'text-white/70' : 'text-slate-400')}>
                        {formatMessengerDateTime(message.createdAt, i18n.language)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <MessengerComposer
          value={composerText}
          originalLanguage={originalLanguage}
          driverLanguage={originalLanguage}
          sending={sending}
          driverName={conversation?.driver ? `${conversation.driver.firstName} ${conversation.driver.lastName}` : null}
          onChange={setComposerText}
          onOriginalLanguageChange={setOriginalLanguage}
          onSend={() => void handleSend()}
        />
      </div>
    </DriverPortalShell>
  );
}
