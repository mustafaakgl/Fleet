'use client';

import { ChevronLeft, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MessengerComposer } from '@/components/messenger/MessengerComposer';
import { getUser } from '@/lib/auth';
import {
  conversationTitle,
  departmentBadgeClass,
  driverDisplayName,
  formatMessengerDateTime,
  groupMessagesByDay,
  personInitials,
  resolveDriverLanguageFromConversation,
} from '@/lib/messenger-utils';
import { cn } from '@/lib/utils';
import type {
  ConversationDetail,
  MessengerLanguage,
  MessengerMessage,
} from '@/lib/types';

interface MessengerChatPanelProps {
  selectedConversationId: string | null;
  selectedConversation: ConversationDetail | null;
  messages: MessengerMessage[];
  loading: boolean;
  composerText: string;
  originalLanguage: MessengerLanguage;
  sending: boolean;
  onBack: () => void;
  onComposerChange: (value: string) => void;
  onOriginalLanguageChange: (language: MessengerLanguage) => void;
  onSend: () => void;
}

function MessageBubble({
  message,
  own,
  t,
  locale,
}: {
  message: MessengerMessage;
  own: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
}) {
  return (
    <div
      className={cn(
        'max-w-[min(85%,28rem)] animate-in fade-in slide-in-from-bottom-1 duration-200',
        own ? 'ml-auto' : 'mr-auto',
      )}
    >
      {!own ? (
        <p className="mb-1 px-1 text-[11px] font-medium text-slate-500">{message.senderName}</p>
      ) : null}
      <div
        className={cn(
          'rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm',
          own
            ? 'rounded-br-md bg-brand-primary text-white'
            : 'rounded-bl-md border border-slate-200 bg-white text-slate-900',
        )}
      >
        {message.translatedText && !own ? (
          <>
            <p className="whitespace-pre-wrap">{message.translatedText}</p>
            <p
              className={cn(
                'mt-1.5 whitespace-pre-wrap text-[11px]',
                own ? 'text-white/75' : 'text-slate-500',
              )}
            >
              {t('messenger.originalLabel', { lang: message.originalLanguage })}{' '}
              {message.originalText}
            </p>
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{message.originalText}</p>
            {message.translatedText ? (
              <p
                className={cn(
                  'mt-1.5 whitespace-pre-wrap text-[11px]',
                  own ? 'text-white/80' : 'text-slate-600',
                )}
              >
                {message.translatedText}
              </p>
            ) : null}
          </>
        )}
        {message.translationStatus === 'failed' ? (
          <p className={cn('mt-1 text-[11px]', own ? 'text-amber-200' : 'text-amber-700')}>
            {t('messenger.translationFailed')}
          </p>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1 px-1 text-[10px]',
          own ? 'text-right text-slate-400' : 'text-slate-400',
        )}
      >
        {formatMessengerDateTime(message.createdAt, locale)}
      </p>
    </div>
  );
}

export function MessengerChatPanel({
  selectedConversationId,
  selectedConversation,
  messages,
  loading,
  composerText,
  originalLanguage,
  sending,
  onBack,
  onComposerChange,
  onOriginalLanguageChange,
  onSend,
}: MessengerChatPanelProps) {
  const { t, i18n } = useTranslation();
  const currentUserId = getUser()?.id;
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const messageGroups = useMemo(
    () =>
      groupMessagesByDay(messages, {
        today: t('messenger.today'),
        yesterday: t('messenger.yesterday'),
      }, i18n.language),
    [messages, t, i18n.language],
  );

  if (!selectedConversationId) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-6">
        <EmptyState
          icon={UserRound}
          title={t('messenger.noConversationSelectedTitle')}
          subtitle={t('messenger.noConversationSelectedSubtitle')}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="ml-auto h-16 w-2/3" />
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-16 w-1/2" />
        </div>
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={UserRound}
          title={t('messenger.conversationUnavailableTitle')}
          subtitle={t('messenger.conversationUnavailableSubtitle')}
        />
      </div>
    );
  }

  const driverName = driverDisplayName(selectedConversation);
  const driverLanguage = resolveDriverLanguageFromConversation(selectedConversation);
  const initials = personInitials(driverName);
  const dept = selectedConversation.department;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 xl:hidden"
            onClick={onBack}
            aria-label={t('messenger.backToList')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-slate-900">
              {conversationTitle(selectedConversation)}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {dept ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    departmentBadgeClass(dept),
                  )}
                >
                  {t(`messenger.dept.${dept}`)}
                </span>
              ) : null}
              <p className="truncate text-[12px] text-slate-500">
                {t('messenger.participants')}{' '}
                {selectedConversation.participants.map((p) => p.user.fullName).join(', ')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-[13px] text-slate-500">{t('messenger.noMessages')}</p>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.key}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-3">
                  {group.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      own={message.senderUserId === currentUserId}
                      t={t}
                      locale={i18n.language}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>

      <MessengerComposer
        value={composerText}
        originalLanguage={originalLanguage}
        driverLanguage={driverLanguage}
        sending={sending}
        driverName={driverName}
        onChange={onComposerChange}
        onOriginalLanguageChange={onOriginalLanguageChange}
        onSend={onSend}
      />
    </div>
  );
}
